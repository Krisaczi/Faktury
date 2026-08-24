import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getPlanById, type PlanInfo } from './actions';
import { normalizePlanId, getPlanLabel } from './plan-mapping';

// Re-export for backwards compatibility
export { normalizePlanId, getPlanLabel };

// ─── Types ──────────────────────────────────────────────────────────────────────

export type PlanSource = 'plan_assignments' | 'company' | 'default';

export interface EffectivePlan {
  planId:           string;
  planName:         string;
  planLabel:        string;
  monthlyPrice:     number;
  source:           PlanSource;
  companyId:        string | null;
  limits: PlanInfo['limits'] | null;
  assignedAt:       string | null;
  updatedAt:        string | null;
}

// ─── getEffectivePlan — canonical plan resolver ─────────────────────────────────

/**
 * Returns the authoritative plan for a user.
 *
 * Resolution order:
 * 1. plan_assignments (canonical table — single active row per company)
 * 2. companies.product_type / package_type (legacy fallback)
 * 3. 'starter' (deterministic default)
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

  return getEffectivePlanByCompanyId(user.company_id);
}

// ─── getEffectivePlanByCompanyId ────────────────────────────────────────────────

/**
 * Returns the authoritative plan for a company.
 * Reads from plan_assignments first, falls back to companies columns.
 */
export async function getEffectivePlanByCompanyId(companyId: string): Promise<EffectivePlan> {
  const supabase = await getSupabaseServerClient();

  // 1. Check plan_assignments (canonical source)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: assignment } = await (supabase as any)
    .from('plan_assignments')
    .select('plan_id, status, effective_from, updated_at, metadata')
    .eq('entity_id', companyId)
    .eq('entity_type', 'company')
    .eq('status', 'active')
    .maybeSingle();

  if (assignment?.plan_id) {
    const planId = normalizePlanId(assignment.plan_id);
    const plan = getPlanById(planId);

    return {
      planId,
      planName:     plan?.name ?? getPlanLabel(planId),
      planLabel:    getPlanLabel(planId),
      monthlyPrice: plan?.monthlyPrice ?? 0,
      source:       'plan_assignments',
      companyId:    companyId,
      limits:       plan?.limits ?? null,
      assignedAt:   assignment.effective_from ?? null,
      updatedAt:    assignment.updated_at ?? null,
    };
  }

  // 2. Fallback: read from companies columns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('product_type, package_type, package_assigned_at, updated_at')
    .eq('id', companyId)
    .maybeSingle();

  if (!company) {
    return defaultPlan(companyId);
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
    companyId:    companyId,
    limits:       plan?.limits ?? null,
    assignedAt:   company.package_assigned_at ?? null,
    updatedAt:    company.updated_at ?? null,
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
    assignedAt:       null,
    updatedAt:        null,
  };
}
