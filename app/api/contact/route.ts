import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/server';

const schema = z.object({
  name:    z.string().min(2).max(200),
  email:   z.string().email().max(320),
  subject: z.string().max(300).optional(),
  message: z.string().min(10).max(5000),
  _hp:     z.string().max(0),  // honeypot — must be empty
});

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
  const supabase = getSupabaseServiceClient();
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

  return NextResponse.json({ ok: true });
}
