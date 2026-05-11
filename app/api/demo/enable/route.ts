import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const DEMO_COOKIE    = 'rg_demo_session';
const COOKIE_MAX_AGE = 24 * 60 * 60; // 24 h — refreshed by status endpoint

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { demoSessionId?: string };

  if (!body.demoSessionId) {
    return NextResponse.json({ error: 'demoSessionId is required' }, { status: 400 });
  }

  const db = getAdminClient();

  // Validate the session exists and has not expired
  const { data: session } = await (db.from as Function)('demo_sessions')
    .select('id, expires_at, is_active, demo_user_id')
    .eq('id', body.demoSessionId)
    .maybeSingle();

  if (!session || !session.is_active) {
    return NextResponse.json({ error: 'Invalid or expired demo session' }, { status: 404 });
  }

  if (new Date(session.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Demo session has expired' }, { status: 410 });
  }

  const res = NextResponse.json({ ok: true, expiresAt: session.expires_at });

  // Set a server-only HttpOnly cookie scoped to the app
  res.cookies.set(DEMO_COOKIE, body.demoSessionId, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   COOKIE_MAX_AGE,
    path:     '/',
  });

  return res;
}
