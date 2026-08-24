import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getPlanById, type PlanInfo } from './actions';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type PlanSource = 'company' | 'default';

export interface EffectivePlan {
  planId:           string;
  planName:         string;
  planLabel:        string;
  monthlyPrice:     number;
  source:           PlanSource;
  companyId:        string | null;
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
 * 1. companies.product_type (sole source of truth)
 * 2. 'starter' (deterministic default)
 *
 * This is the single function all APIs and pages should use for plan display and gating.
 */
export async function getEffectivePlan(userId: string): Promise<EffectivePlan> {
  const supabase = await getSupabaseServerClient();

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
    .select('product_type, package_type')
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
    companyId:    user.company_id,
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
    companyId:        companyId ?? null,
    limits:           plan?.limits ?? null,
  };
}

// ─── getEffectivePlanByCompanyId ────────────────────────────────────────────────

/**
 * Convenience: get effective plan for a company directly.
 */
export async function getEffectivePlanByCompanyId(companyId: string): Promise<EffectivePlan> {
  const supabase = await getSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('product_type, package_type')
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
    companyId:    companyId,
    limits:       plan?.limits ?? null,
  };
}
