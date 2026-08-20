import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { reconcileBatch } from '@/lib/plans/reconciliation';

// POST /api/owner/users/reconcile-batch
// Body: { emails?: string[], dryRun?: boolean, reason?: string }

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: u } = await (supabase as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (u?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden — tylko właściciel' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;

  if (body.emails && !Array.isArray(body.emails)) {
    return NextResponse.json({ error: 'emails must be an array' }, { status: 400 });
  }

  const result = await reconcileBatch(user.id, ownerIp, {
    emails: body.emails,
    dryRun: body.dryRun === true,
    reason: body.reason,
  });

  return NextResponse.json({
    ok:          true,
    dryRun:      body.dryRun === true,
    totalScanned: result.totalScanned,
    totalFixed:  result.totalFixed,
    totalNoop:   result.totalNoop,
    totalErrors: result.totalErrors,
    results:     result.results,
  });
}
