import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  getPlanById, isDowngrade, getCompanyUsage,
  checkUsageConflicts, computeProration, logPlanChange,
} from '@/lib/plans/actions';

const ChangePlanSchema = z.object({
  planId:      z.string().min(1),
  effective:   z.enum(['now', 'period_end']),
  reason:      z.string().max(500).optional(),
  notes:       z.string().max(2000).optional(),
  notifyUser:  z.boolean().optional().default(true),
  forceDowngrade: z.boolean().optional().default(false),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: admin } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (admin?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden — tylko właściciel może zmieniać plany' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = ChangePlanSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({
      error: 'Błąd walidacji',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }, { status: 400 });
  }

  const { planId, effective, reason, notes, forceDowngrade } = parsed.data;
  const targetPlan = getPlanById(planId);

  if (!targetPlan || !targetPlan.active) {
    return NextResponse.json({ error: 'Nieprawidłowy plan.' }, { status: 400 });
  }

  // Fetch target user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targetUser } = await (supabase as any)
    .from('users')
    .select('id, email, company_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!targetUser) {
    return NextResponse.json({ error: 'Użytkownik nie znaleziony.' }, { status: 404 });
  }

  if (!targetUser.company_id) {
    return NextResponse.json({ error: 'Użytkownik nie ma przypisanej firmy.' }, { status: 400 });
  }

  // Fetch current plan
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('product_type')
    .eq('id', targetUser.company_id)
    .maybeSingle();

  const fromPlan = (company?.product_type ?? 'starter') as string;

  if (fromPlan === planId) {
    return NextResponse.json({ error: 'Firma jest już na tym planie.' }, { status: 409 });
  }

  // Check downgrade usage conflicts
  const downgrade = isDowngrade(fromPlan, planId);
  let conflicts: ReturnType<typeof checkUsageConflicts> = [];

  if (downgrade && effective === 'now') {
    const usage = await getCompanyUsage(targetUser.company_id);
    conflicts = checkUsageConflicts(usage, targetPlan);

    if (conflicts.length > 0 && !forceDowngrade) {
      return NextResponse.json({
        error: 'Obecne użycie przekracza limity nowego planu.',
        conflicts,
        requiresForceDowngrade: true,
      }, { status: 422 });
    }
  }

  // Compute proration preview
  const proration = computeProration(fromPlan, planId, effective);

  // Apply plan change
  if (effective === 'now') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase as any)
      .from('companies')
      .update({
        product_type:       planId,
        package_type:       planId,
        package_assigned_at: new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      })
      .eq('id', targetUser.company_id);

    if (updateErr) {
      return NextResponse.json({ error: 'Błąd aktualizacji planu.' }, { status: 500 });
    }

    // Also log to billing_audit
    // eslint-disable-next-line @typescript-typescript/no-explicit-any
    await (supabase as any).from('billing_audit').insert({
      company_id:  targetUser.company_id,
      event_type:  'plan_changed',
      from_plan:   fromPlan,
      to_plan:     planId,
      changed_by:  user.id,
      metadata:    { reason: reason ?? null, notes: notes ?? null, effective: 'now' },
    });
  }

  // For period_end: we log the scheduled change; actual execution would be done
  // by a cron job. For now we persist the intent in plan_change_audit.
  if (effective === 'period_end') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('billing_audit').insert({
      company_id:  targetUser.company_id,
      event_type:  'plan_scheduled',
      from_plan:   fromPlan,
      to_plan:     planId,
      changed_by:  user.id,
      metadata:    { reason: reason ?? null, notes: notes ?? null, effective: 'period_end' },
    });
  }

  // Log to plan_change_audit
  const adminIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  await logPlanChange({
    adminId:       user.id,
    targetUserId:  params.id,
    companyId:     targetUser.company_id,
    fromPlan,
    toPlan:        planId,
    effective,
    reason,
    notes,
    adminIp: adminIp ?? undefined,
  });

  return NextResponse.json({
    ok: true,
    fromPlan,
    toPlan: planId,
    effective,
    proration,
    conflicts: conflicts.length > 0 ? conflicts : undefined,
    message: effective === 'now'
      ? `Plan zmieniony z ${fromPlan} na ${planId}.`
      : `Zmiana planu zaplanowana na koniec okresu rozliczeniowego.`,
  });
}
