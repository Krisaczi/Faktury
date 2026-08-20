import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getCompanyUsage, checkUsageConflicts, getPlanById } from '@/lib/plans/actions';
import { getEffectivePlan, getPlanLabel } from '@/lib/plans/canonical-plan';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: u } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (u?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden — tylko właściciel' }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targetUser, error: targetErr } = await (supabase as any)
    .from('users')
    .select('id, email, role, company_id')
    .eq('id', params.id)
    .maybeSingle();

  if (targetErr || !targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('full_name')
    .eq('id', params.id)
    .maybeSingle();

  targetUser.full_name = profile?.full_name ?? null;

  if (!targetUser.company_id) {
    return NextResponse.json({ error: 'User has no company' }, { status: 400 });
  }

  // Use canonical plan resolver — checks subscriptions table first, falls back to companies
  const effectivePlan = await getEffectivePlan(params.id);

  const usage = await getCompanyUsage(targetUser.company_id);
  const currentPlan = getPlanById(effectivePlan.planId);
  const conflicts = currentPlan ? checkUsageConflicts(usage, currentPlan) : [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: auditLogs } = await (supabase as any)
    .from('plan_change_audit')
    .select('id, from_plan, to_plan, effective, reason, notes, created_at, owner_id')
    .eq('target_user_id', params.id)
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({
    user: targetUser,
    currentPlan: {
      id:           effectivePlan.planId,
      name:         effectivePlan.planName,
      label:        effectivePlan.planLabel,
      description:  currentPlan?.description ?? '',
      monthlyPrice: effectivePlan.monthlyPrice,
      limits:       effectivePlan.limits,
    },
    subscription: {
      status:           effectivePlan.subscriptionStatus,
      assignedAt:       null,
      currentPeriodEnd: effectivePlan.currentPeriodEnd,
      lastSyncedAt:     effectivePlan.lastSyncedAt,
      source:           effectivePlan.source,
    },
    usage,
    conflicts,
    auditLogs: auditLogs ?? [],
  });
}
