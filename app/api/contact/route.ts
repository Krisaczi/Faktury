import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

const CONTACT_INBOX = process.env.CONTACT_INBOX_EMAIL ?? 'kontakt@bezpiecznefaktury.pl';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip',
];

const schema = z.object({
  name:    z.string().min(2).max(200),
  email:   z.string().email().max(320),
  phone:   z.string().max(50).optional(),
  subject: z.string().min(1).max(300),
  message: z.string().min(10).max(5000),
  _hp:     z.string().max(0), // honeypot — must be empty
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ─── Email sender (Resend) ────────────────────────────────────────────────────

async function sendNotificationEmail(opts: {
  to: string;
  fromName: string;
  fromEmail: string;
  phone?: string;
  subject: string;
  message: string;
  attachmentFilename?: string;
}): Promise<{ id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: 'RESEND_API_KEY not configured' };

  const fromAddress = process.env.RESEND_FROM_EMAIL ?? 'kontakt@bezpiecznefaktury.pl';

  const subjectLine = `[Formularz kontaktowy] ${opts.subject}`;

  const phoneRow = opts.phone
    ? `<p style="margin:0 0 16px;font-size:14px;color:#374151"><strong>Telefon:</strong> ${escapeHtml(opts.phone)}</p>`
    : '';

  const attachmentNote = opts.attachmentFilename
    ? `<p style="margin:0 0 16px;font-size:14px;color:#374151"><strong>Załącznik:</strong> ${escapeHtml(opts.attachmentFilename)}</p>`
    : '';

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
            ${phoneRow}
            <p style="margin:0 0 16px;font-size:14px;color:#374151"><strong>Temat:</strong> ${escapeHtml(opts.subject)}</p>
            ${attachmentNote}
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
    opts.phone ? `Telefon: ${opts.phone}` : '',
    `Temat:   ${opts.subject}`,
    opts.attachmentFilename ? `Załącznik: ${opts.attachmentFilename}` : '',
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

// ─── Rate limiting (database-backed) ──────────────────────────────────────────

async function checkRateLimit(ip: string): Promise<boolean> {
  const serviceClient = getSupabaseServiceClient();
  const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (serviceClient as any)
    .from('contact_messages')
    .select('*', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .gte('created_at', windowStart);

  if (error) {
    console.error('[contact] rate-limit check error:', error.message);
    return true; // fail open — don't block on infra issues
  }

  return (count ?? 0) < 3;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0';
  const userAgent = req.headers.get('user-agent') ?? null;

  // Rate limit
  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Zbyt wiele wiadomości. Spróbuj ponownie za kilka minut.' },
      { status: 429 }
    );
  }

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe żądanie.' }, { status: 400 });
  }

  const name    = formData.get('name') as string | null;
  const email   = formData.get('email') as string | null;
  const phone   = (formData.get('phone') as string | null) || undefined;
  const subject = formData.get('subject') as string | null;
  const message = formData.get('message') as string | null;
  const hp      = (formData.get('_hp') as string | null) || '';
  const file    = formData.get('attachment') as File | null;

  // Honeypot — silently accept but do nothing
  if (hp.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const parsed = schema.safeParse({ name, email, phone, subject, message, _hp: hp });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Nieprawidłowe dane formularza.', details: parsed.error.issues },
      { status: 422 }
    );
  }

  const d = parsed.data;

  // Validate file attachment if present
  let attachmentUrl: string | null = null;
  let attachmentMeta: { filename: string; size: number; mime_type: string } | null = null;

  if (file && file.size > 0) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Załącznik jest za duży (max 10 MB).' },
        { status: 422 }
      );
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { error: 'Nieobsługiwany typ pliku.' },
        { status: 422 }
      );
    }

    // Upload to Supabase Storage
    const serviceClient = getSupabaseServiceClient();
    const ext = file.name.split('.').pop() ?? 'bin';
    const filePath = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { data: uploadData, error: uploadError } = await serviceClient.storage
      .from('contact-attachments')
      .upload(filePath, file, { contentType: file.type, upsert: false });

    if (uploadError || !uploadData) {
      console.error('[contact] storage upload error:', uploadError?.message);
      return NextResponse.json(
        { error: 'Błąd przesyłania pliku. Spróbuj bez załącznika.' },
        { status: 500 }
      );
    }

    attachmentUrl = filePath;
    attachmentMeta = { filename: file.name, size: file.size, mime_type: file.type };
  }

  // Persist to database
  const serviceClient = getSupabaseServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insertedRow, error: dbError } = await (serviceClient as any)
    .from('contact_messages')
    .insert({
      sender_name:     d.name,
      sender_email:    d.email,
      sender_phone:    d.phone ?? null,
      subject:         d.subject,
      message:         d.message,
      attachment_url:  attachmentUrl,
      attachment_meta: attachmentMeta,
      ip_address:      ip,
      user_agent:      userAgent,
      status:          'new',
    })
    .select('id')
    .single();

  if (dbError || !insertedRow) {
    console.error('[contact] db insert error:', dbError?.message);
    return NextResponse.json(
      { error: 'Błąd zapisu. Spróbuj ponownie później.' },
      { status: 500 }
    );
  }

  // Send email notification
  const emailResult = await sendNotificationEmail({
    to:                 CONTACT_INBOX,
    fromName:           d.name,
    fromEmail:          d.email,
    phone:              d.phone,
    subject:            d.subject,
    message:            d.message,
    attachmentFilename: attachmentMeta?.filename,
  });

  // Update delivery status
  if (emailResult.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (serviceClient as any)
      .from('contact_messages')
      .update({ delivered: true, delivered_at: new Date().toISOString() })
      .eq('id', insertedRow.id);
  } else if (emailResult.error) {
    console.error('[contact] email send error:', emailResult.error);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (serviceClient as any)
      .from('contact_messages')
      .update({ delivery_error: emailResult.error })
      .eq('id', insertedRow.id);
  }

  return NextResponse.json({ ok: true });
}
