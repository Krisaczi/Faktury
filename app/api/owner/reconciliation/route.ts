import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { generateReconciliationReport, reconcileAll } from '@/lib/plans/reconciliation';

// GET /api/owner/reconciliation
// Returns the full reconciliation report with mismatch details.

export async function GET(req: NextRequest) {
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

  const onlyMismatches = req.nextUrl.searchParams.get('mismatches') === 'true';
  const report = await generateReconciliationReport();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recentLogs } = await (supabase as any)
    .from('plan_change_audit')
    .select('id, target_user_id, company_id, from_plan, to_plan, effective, reason, owner_ip, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({
    report: {
      ...report,
      entries: onlyMismatches ? report.entries.filter((e) => e.mismatch) : report.entries,
    },
    recentReconciliations: recentLogs ?? [],
  });
}

// POST /api/owner/reconciliation
// Triggers bulk reconciliation for all mismatched users.
// Body: { dryRun?: boolean, reason?: string }

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

  const result = await reconcileAll(user.id, ownerIp, {
    dryRun: body.dryRun === true,
    reason: body.reason,
  });

  return NextResponse.json({
    ok:          true,
    dryRun:      body.dryRun === true,
    totalFixed:  result.totalFixed,
    totalNoop:   result.totalNoop,
    totalErrors: result.totalErrors,
    results:     result.results,
  });
}
