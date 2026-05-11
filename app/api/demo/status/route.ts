import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const DEMO_COOKIE = 'rg_demo_session';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get(DEMO_COOKIE)?.value;

  if (!sessionId) {
    return NextResponse.json({ isDemo: false });
  }

  const db = getAdminClient();
  const { data: session } = await (db.from as Function)('demo_sessions')
    .select('id, expires_at, is_active, seed_preset, pages_visited')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session || !session.is_active) {
    const res = NextResponse.json({ isDemo: false });
    res.cookies.set(DEMO_COOKIE, '', { maxAge: 0, path: '/' });
    return res;
  }

  const expiresAt  = new Date(session.expires_at);
  const now        = new Date();
  const remainingMs = expiresAt.getTime() - now.getTime();

  if (remainingMs <= 0) {
    // Session expired
    await (db.from as Function)('demo_sessions')
      .update({ is_active: false })
      .eq('id', sessionId);
    const res = NextResponse.json({ isDemo: false, expired: true });
    res.cookies.set(DEMO_COOKIE, '', { maxAge: 0, path: '/' });
    return res;
  }

  return NextResponse.json({
    isDemo:           true,
    demoSessionId:    sessionId,
    expiresAt:        session.expires_at,
    remainingMs,
    remainingMinutes: Math.floor(remainingMs / 60_000),
    seedPreset:       session.seed_preset,
  });
}
