import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getPlanById, type PlanInfo } from './actions';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type PlanSource = 'subscription' | 'company' | 'default';

export interface EffectivePlan {
  planId:           string;
  planName:         string;
  planLabel:        string;
  monthlyPrice:     number;
  source:           PlanSource;
  subscriptionStatus: string;
  lastSyncedAt:     string | null;
  companyId:        string | null;
  currentPeriodEnd: string | null;
  limits: PlanInfo['limits'] | null;
}

// ─── Plan label mapping ─────────────────────────────────────────────────────────

export { normalizePlanId, getPlanLabel } from './plan-mapping';
import { normalizePlanId, getPlanLabel } from './plan-mapping';

// ─── getEffectivePlan — canonical plan resolver ─────────────────────────────────

/**
 * Returns the authoritative plan for a user.
 *
 * Resolution order:
 * 1. Active subscription row in `subscriptions` table (canonical source)
 * 2. `companies.product_type` (derived/convenience field, fallback)
 * 3. 'starter' (deterministic default)
 *
 * This is the single function all APIs and pages should use for plan display and gating.
 */
export async function getEffectivePlan(userId: string): Promise<EffectivePlan> {
  const supabase = await getSupabaseServerClient();

  // 1. Check subscriptions table first (canonical source)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub } = await (supabase as any)
    .from('subscriptions')
    .select('id, plan_id, status, current_period_end, last_synced_at, company_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (sub && sub.status === 'active') {
    const planId = normalizePlanId(sub.plan_id);
    const plan = getPlanById(planId);
    return {
      planId,
      planName:     plan?.name ?? getPlanLabel(planId),
      planLabel:    getPlanLabel(planId),
      monthlyPrice: plan?.monthlyPrice ?? 0,
      source:       'subscription',
      subscriptionStatus: sub.status ?? 'active',
      lastSyncedAt: sub.last_synced_at ?? null,
      companyId:    sub.company_id ?? null,
      currentPeriodEnd: sub.current_period_end ?? null,
      limits:       plan?.limits ?? null,
    };
  }

  // 2. Fall back to companies.product_type (derived field)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: user } = await (supabase as any)
    .from('users')
    .select('company_id')
    .eq('id', userId)
    .maybeSingle();

  if (!user?.company_id) {
    return defaultPlan();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('product_type, package_type, subscription_status')
    .eq('id', user.company_id)
    .maybeSingle();

  if (!company) {
    return defaultPlan(user.company_id);
  }

  const rawPlanId = company.product_type ?? company.package_type ?? 'starter';
  const planId = normalizePlanId(rawPlanId);
  const plan = getPlanById(planId);

  return {
    planId,
    planName:     plan?.name ?? getPlanLabel(planId),
    planLabel:    getPlanLabel(planId),
    monthlyPrice: plan?.monthlyPrice ?? 0,
    source:       'company',
    subscriptionStatus: company.subscription_status ?? 'active',
    lastSyncedAt: null,
    companyId:    user.company_id,
    currentPeriodEnd: null,
    limits:       plan?.limits ?? null,
  };
}

function defaultPlan(companyId?: string): EffectivePlan {
  const plan = getPlanById('starter');
  return {
    planId:           'starter',
    planName:         plan?.name ?? 'Starter',
    planLabel:        'Starter',
    monthlyPrice:     0,
    source:           'default',
    subscriptionStatus: 'active',
    lastSyncedAt:     null,
    companyId:        companyId ?? null,
    currentPeriodEnd: null,
    limits:           plan?.limits ?? null,
  };
}

// ─── getEffectivePlanByCompanyId ────────────────────────────────────────────────

/**
 * Convenience: get effective plan for a company (looks up the first active user).
 */
export async function getEffectivePlanByCompanyId(companyId: string): Promise<EffectivePlan> {
  const supabase = await getSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub } = await (supabase as any)
    .from('subscriptions')
    .select('id, plan_id, status, current_period_end, last_synced_at, user_id, company_id')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .maybeSingle();

  if (sub) {
    const planId = normalizePlanId(sub.plan_id);
    const plan = getPlanById(planId);
    return {
      planId,
      planName:     plan?.name ?? getPlanLabel(planId),
      planLabel:    getPlanLabel(planId),
      monthlyPrice: plan?.monthlyPrice ?? 0,
      source:       'subscription',
      subscriptionStatus: sub.status ?? 'active',
      lastSyncedAt: sub.last_synced_at ?? null,
      companyId:    sub.company_id ?? companyId,
      currentPeriodEnd: sub.current_period_end ?? null,
      limits:       plan?.limits ?? null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('product_type, package_type, subscription_status')
    .eq('id', companyId)
    .maybeSingle();

  const rawPlanId = company?.product_type ?? company?.package_type ?? 'starter';
  const planId = normalizePlanId(rawPlanId);
  const plan = getPlanById(planId);

  return {
    planId,
    planName:     plan?.name ?? getPlanLabel(planId),
    planLabel:    getPlanLabel(planId),
    monthlyPrice: plan?.monthlyPrice ?? 0,
    source:       'company',
    subscriptionStatus: company?.subscription_status ?? 'active',
    lastSyncedAt: null,
    companyId:    companyId,
    currentPeriodEnd: null,
    limits:       plan?.limits ?? null,
  };
}

// ─── Sync subscription from company state ──────────────────────────────────────

/**
 * Upserts a subscription row from the companies table.
 * Called after plan changes to keep subscriptions in sync.
 */
export async function syncSubscriptionFromCompany(
  userId: string,
  companyId: string,
): Promise<void> {
  const supabase = await getSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('product_type, subscription_status')
    .eq('id', companyId)
    .maybeSingle();

  const planId = normalizePlanId(company?.product_type);
  const status = company?.subscription_status === 'canceled' ? 'canceled' : 'active';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('subscriptions')
    .upsert({
      user_id:        userId,
      company_id:     companyId,
      plan_id:        planId,
      status,
      last_synced_at: new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'user_id' });
}
