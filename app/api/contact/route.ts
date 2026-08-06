import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const CONTACT_INBOX = process.env.CONTACT_INBOX_EMAIL ?? 'kontakt@bezpiecznefaktury.pl';

const schema = z.object({
  name:    z.string().min(2).max(200),
  email:   z.string().email().max(320),
  subject: z.string().max(300).optional(),
  message: z.string().min(10).max(5000),
  _hp:     z.string().max(0),  // honeypot — must be empty
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

async function sendNotificationEmail(opts: {
  to: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  message: string;
}): Promise<{ id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: 'RESEND_API_KEY not configured' };

  const fromAddress = process.env.RESEND_FROM_EMAIL ?? 'kontakt@bezpiecznefaktury.pl';

  const subjectLine = opts.subject
    ? `[Formularz kontaktowy] ${opts.subject}`
    : `[Formularz kontaktowy] Nowa wiadomość od ${opts.fromName}`;

  const html = `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
        <tr>
          <td style="background:#1d4ed8;padding:24px 40px">
            <h1 style="margin:0;font-size:18px;font-weight:700;color:#fff">Nowa wiadomość z formularza kontaktowego</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 40px">
            <p style="margin:0 0 16px;font-size:14px;color:#374151"><strong>Od:</strong> ${escapeHtml(opts.fromName)}</p>
            <p style="margin:0 0 16px;font-size:14px;color:#374151"><strong>E-mail:</strong> ${escapeHtml(opts.fromEmail)}</p>
            ${opts.subject ? `<p style="margin:0 0 16px;font-size:14px;color:#374151"><strong>Temat:</strong> ${escapeHtml(opts.subject)}</p>` : ''}
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0" />
            <p style="margin:0;font-size:14px;color:#374151;white-space:pre-wrap;line-height:1.6">${escapeHtml(opts.message)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:12px;color:#9ca3af">Wiadomość wysłana przez formularz kontaktowy na bezpiecznefaktury.pl</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Nowa wiadomość z formularza kontaktowego`,
    ``,
    `Od:      ${opts.fromName}`,
    `E-mail:  ${opts.fromEmail}`,
    opts.subject ? `Temat:   ${opts.subject}` : '',
    ``,
    opts.message,
  ]
    .filter(Boolean)
    .join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [opts.to],
      replyTo: opts.fromEmail,
      subject: subjectLine,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    return { error: `Resend error ${res.status}: ${detail.slice(0, 200)}` };
  }

  const json = (await res.json()) as { id?: string };
  return { id: json.id };
}

// Simple in-memory rate limit: max 3 submissions per IP per 10 minutes.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 10 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Zbyt wiele prób. Spróbuj ponownie za chwilę.' },
      { status: 429 }
    );
  }

  // Parse and validate
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe żądanie.' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // Honeypot triggered → silently accept but do nothing
    const issues = parsed.error.issues;
    if (issues.some((i) => i.path[0] === '_hp')) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Nieprawidłowe dane formularza.' }, { status: 422 });
  }

  const { name, email, subject, message } = parsed.data;

  // Persist to Supabase for logging / follow-up
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbError } = await (supabase as any).from('contact_submissions').insert({
    name,
    email,
    subject: subject ?? null,
    message,
    ip_address: ip,
  });

  if (dbError) {
    console.error('[contact] db insert error:', dbError.message);
    return NextResponse.json(
      { error: 'Błąd zapisu. Spróbuj ponownie później.' },
      { status: 500 }
    );
  }

  // Send email notification to the contact inbox
  const emailResult = await sendNotificationEmail({
    to: CONTACT_INBOX,
    fromName: name,
    fromEmail: email,
    subject: subject ?? '',
    message,
  });
  if (emailResult.error) {
    console.error('[contact] email send error:', emailResult.error);
  }

  return NextResponse.json({ ok: true });
}
