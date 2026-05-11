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

export async function POST(req: NextRequest) {
  const sessionId = req.cookies.get(DEMO_COOKIE)?.value;

  if (sessionId) {
    const db = getAdminClient();
    // Mark session as exited (non-destructive — cleanup job handles deletion)
    await (db.from as Function)('demo_sessions')
      .update({ exited_at: new Date().toISOString() })
      .eq('id', sessionId);
  }

  const res = NextResponse.json({ ok: true });
  // Clear the demo cookie
  res.cookies.set(DEMO_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
