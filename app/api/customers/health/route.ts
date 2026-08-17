import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(_req: NextRequest) {
  const checks: Record<string, { status: 'pass' | 'warn' | 'fail'; detail: string }> = {};

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: 'fail', error: 'Unauthorized' }, { status: 401 });
  }

  const { data: u } = await supabase
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) {
    return NextResponse.json({ status: 'fail', error: 'No company' }, { status: 403 });
  }

  // Check 1: buyer_companies table accessible
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: tableErr } = await (supabase as any)
    .from('buyer_companies')
    .select('id')
    .eq('company_id', u.company_id)
    .limit(1);

  if (tableErr) {
    checks.database = { status: 'fail', detail: `buyer_companies table error: ${tableErr.message}` };
  } else {
    checks.database = { status: 'pass', detail: 'buyer_companies table accessible' };
  }

  // Check 2: customer count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error: countErr } = await (supabase as any)
    .from('buyer_companies')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', u.company_id)
    .is('deleted_at', null);

  if (countErr) {
    checks.customer_count = { status: 'warn', detail: 'Cannot count customers' };
  } else {
    checks.customer_count = {
      status: count === 0 ? 'warn' : 'pass',
      detail: count === 0 ? 'No customers yet — create one from the invoice form.' : `${count} customer(s) configured`,
    };
  }

  // Check 3: customer_audit_log accessible
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: auditErr } = await (supabase as any)
    .from('customer_audit_log')
    .select('id')
    .eq('company_id', u.company_id)
    .limit(1);

  if (auditErr) {
    checks.audit_log = { status: 'warn', detail: `customer_audit_log error: ${auditErr.message}` };
  } else {
    checks.audit_log = { status: 'pass', detail: 'customer_audit_log accessible' };
  }

  // Check 4: recent audit events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recentEvents, error: recentErr } = await (supabase as any)
    .from('customer_audit_log')
    .select('id, event_type, created_at')
    .eq('company_id', u.company_id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (recentErr) {
    checks.recent_events = { status: 'warn', detail: 'Cannot query recent audit events' };
  } else if (!recentEvents || recentEvents.length === 0) {
    checks.recent_events = { status: 'warn', detail: 'No customer events logged yet' };
  } else {
    checks.recent_events = {
      status: 'pass',
      detail: `Last event: ${recentEvents[0].event_type} at ${recentEvents[0].created_at}`,
    };
  }

  const hasFail = Object.values(checks).some((c) => c.status === 'fail');
  const hasWarn = Object.values(checks).some((c) => c.status === 'warn');
  const overall = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass';

  return NextResponse.json({ status: overall, checks }, { status: overall === 'fail' ? 503 : 200 });
}
