import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  getPlanById, isDowngrade, getCompanyUsage,
  checkUsageConflicts, computeProration, logPlanChange,
  logPlanNotification, cancelSubscription,
} from '@/lib/plans/actions';
import { syncSubscriptionFromCompany, getEffectivePlan } from '@/lib/plans/canonical-plan';

const ChangePlanSchema = z.object({
  planId:         z.string().min(1),
  effective:      z.enum(['now', 'period_end']),
  reason:         z.string().max(500).optional(),
  notes:          z.string().max(2000).optional(),
  notifyUser:     z.boolean().optional().default(true),
  forceDowngrade: z.boolean().optional().default(false),
});

const CancelSchema = z.object({
  cancel:         z.boolean().optional().default(false),
  effective:      z.enum(['now', 'period_end']).optional().default('period_end'),
  reason:         z.string().max(500).optional(),
  notes:          z.string().max(2000).optional(),
  notifyUser:     z.boolean().optional().default(true),
});

export async function POST(
  req: NextRequest,
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
    return NextResponse.json({ error: 'Forbidden — tylko właściciel może zmieniać plany' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  // ── Cancel subscription path ────────────────────────────────────────────────
  if (body.cancel === true) {
    const parsed = CancelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Błąd walidacji', fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: targetUser } = await (supabase as any)
      .from('users')
      .select('id, email, company_id')
      .eq('id', params.id)
      .maybeSingle();

    if (!targetUser) return NextResponse.json({ error: 'Użytkownik nie znaleziony.' }, { status: 404 });
    if (!targetUser.company_id) return NextResponse.json({ error: 'Użytkownik nie ma firmy.' }, { status: 400 });

    const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
    const result = await cancelSubscription({
      ownerId:      user.id,
      targetUserId: params.id,
      companyId:    targetUser.company_id,
      effective:    parsed.data.effective ?? 'period_end',
      reason:       parsed.data.reason,
      notes:        parsed.data.notes,
      ownerIp,
      notifyUser:   parsed.data.notifyUser,
    });

    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 500 });
    return NextResponse.json({ ok: true, fromPlan: result.fromPlan, effective: result.effective, message: result.message });
  }

  // ── Change plan path ────────────────────────────────────────────────────────
  const parsed = ChangePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Błąd walidacji', fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { planId, effective, reason, notes, notifyUser, forceDowngrade } = parsed.data;
  const targetPlan = getPlanById(planId);

  if (!targetPlan || !targetPlan.active) {
    return NextResponse.json({ error: 'Nieprawidłowy plan.' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targetUser } = await (supabase as any)
    .from('users')
    .select('id, email, company_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!targetUser) return NextResponse.json({ error: 'Użytkownik nie znaleziony.' }, { status: 404 });
  if (!targetUser.company_id) return NextResponse.json({ error: 'Użytkownik nie ma firmy.' }, { status: 400 });

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

  // Downgrade usage conflict check
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

  const proration = computeProration(fromPlan, planId, effective);

  // Apply plan change
  if (effective === 'now') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase as any)
      .from('companies')
      .update({
        product_type:        planId,
        package_type:        planId,
        subscription_status: 'active',
        package_assigned_at: new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      })
      .eq('id', targetUser.company_id);

    if (updateErr) {
      return NextResponse.json({ error: 'Błąd aktualizacji planu.' }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('billing_audit').insert({
      company_id: targetUser.company_id,
      actor_id:    user.id,
      old_package: fromPlan,
      new_package: planId,
      provider:    'internal',
      event_type:  'plan_changed',
      from_plan:   fromPlan,
      to_plan:     planId,
      changed_by:  user.id,
      metadata:    { reason: reason ?? null, notes: notes ?? null, effective: 'now' },
    });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('billing_audit').insert({
      company_id: targetUser.company_id,
      actor_id:    user.id,
      old_package: fromPlan,
      new_package: planId,
      provider:    'internal',
      event_type:  'plan_scheduled',
      from_plan:   fromPlan,
      to_plan:     planId,
      changed_by:  user.id,
      metadata:    { reason: reason ?? null, notes: notes ?? null, effective: 'period_end' },
    });
  }

  // Audit log
  const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
  await logPlanChange({
    ownerId:      user.id,
    targetUserId: params.id,
    companyId:    targetUser.company_id,
    fromPlan,
    toPlan:       planId,
    effective,
    reason,
    notes,
    ownerIp,
  });

  // Notification
  if (notifyUser && targetUser.email) {
    await logPlanNotification({
      companyId:  targetUser.company_id,
      userEmail:  targetUser.email,
      eventType:  effective === 'now' ? 'plan_changed' : 'plan_scheduled',
      fromPlan,
      toPlan:     planId,
      effective,
    });
  }

  // Sync subscription record to match the new plan
  await syncSubscriptionFromCompany(params.id, targetUser.company_id);

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
