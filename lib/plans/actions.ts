import { getSupabaseServerClient } from '@/lib/supabase/server';

export interface PlanInfo {
  id:          string;
  name:        string;
  description: string;
  monthlyPrice: number;
  limits: {
    vendors_limit:     number | null;
    reports_per_month: number | null;
    users_limit:       number | null;
    file_uploads:      boolean;
    invoicing:         boolean;
  };
  active: boolean;
}

export const PLANS: PlanInfo[] = [
  {
    id:          'starter',
    name:        'Starter',
    description: 'Plan podstawowy — podgląd faktur z KSeF, raporty ryzyka (limit), 1 użytkownik.',
    monthlyPrice: 0,
    limits: {
      vendors_limit:     25,
      reports_per_month: 10,
      users_limit:       1,
      file_uploads:      true,
      invoicing:         false,
    },
    active: true,
  },
  {
    id:          'professional',
    name:        'Professional',
    description: 'Pełne fakturowanie, nielimitowani dostawcy, nielimitowane raporty, do 3 użytkowników.',
    monthlyPrice: 4900,
    limits: {
      vendors_limit:     null,
      reports_per_month: null,
      users_limit:       3,
      file_uploads:      true,
      invoicing:         true,
    },
    active: true,
  },
];

export function getPlanById(id: string): PlanInfo | undefined {
  return PLANS.find((p) => p.id === id);
}

export function isDowngrade(fromPlan: string, toPlan: string): boolean {
  const from = PLANS.findIndex((p) => p.id === fromPlan);
  const to   = PLANS.findIndex((p) => p.id === toPlan);
  return to < from;
}

export interface UsageInfo {
  activeUsers:  number;
  vendorCount:  number;
  reportsThisMonth: number;
}

export async function getCompanyUsage(companyId: string): Promise<UsageInfo> {
  const supabase = await getSupabaseServerClient();
  const yearMonth = new Date().toISOString().slice(0, 7);

  const [usersRes, companyRes, usageRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('users').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('active', true),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('companies').select('vendors_count').eq('id', companyId).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('company_report_usage').select('count').eq('company_id', companyId).eq('year_month', yearMonth).maybeSingle(),
  ]);

  return {
    activeUsers:      (usersRes.count as number) ?? 0,
    vendorCount:      (companyRes.data?.vendors_count as number) ?? 0,
    reportsThisMonth: (usageRes.data?.count as number) ?? 0,
  };
}

export interface UsageConflict {
  field:     string;
  label:     string;
  current:   number;
  limit:     number | null;
  over:      boolean;
}

export function checkUsageConflicts(usage: UsageInfo, plan: PlanInfo): UsageConflict[] {
  const conflicts: UsageConflict[] = [];

  if (plan.limits.users_limit !== null && usage.activeUsers > plan.limits.users_limit) {
    conflicts.push({
      field: 'users_limit', label: 'Aktywni użytkownicy',
      current: usage.activeUsers, limit: plan.limits.users_limit, over: true,
    });
  }

  if (plan.limits.vendors_limit !== null && usage.vendorCount > plan.limits.vendors_limit) {
    conflicts.push({
      field: 'vendors_limit', label: 'Dostawcy',
      current: usage.vendorCount, limit: plan.limits.vendors_limit, over: true,
    });
  }

  if (plan.limits.reports_per_month !== null && usage.reportsThisMonth > plan.limits.reports_per_month) {
    conflicts.push({
      field: 'reports_per_month', label: 'Raporty w tym miesiącu',
      current: usage.reportsThisMonth, limit: plan.limits.reports_per_month, over: true,
    });
  }

  return conflicts;
}

export interface ProrationPreview {
  fromPlan:       string;
  toPlan:         string;
  priceDiffCents: number;
  immediate:      boolean;
  effectiveDate:  string;
  nextBillingAt:  string | null;
}

export function computeProration(fromPlan: string, toPlan: string, effective: 'now' | 'period_end'): ProrationPreview {
  const from = getPlanById(fromPlan);
  const to   = getPlanById(toPlan);
  const fromPrice = from?.monthlyPrice ?? 0;
  const toPrice   = to?.monthlyPrice ?? 0;
  const priceDiff = toPrice - fromPrice;

  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    fromPlan,
    toPlan,
    priceDiffCents: priceDiff,
    immediate:      effective === 'now',
    effectiveDate:  effective === 'now' ? now.toISOString() : nextMonth.toISOString(),
    nextBillingAt:  nextMonth.toISOString(),
  };
}

export async function logPlanChange(params: {
  adminId:       string;
  targetUserId:  string;
  companyId:     string | null;
  fromPlan:      string;
  toPlan:        string;
  effective:     'now' | 'period_end';
  reason?:       string;
  notes?:        string;
  adminIp?:      string;
}) {
  const supabase = await getSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('plan_change_audit').insert({
    admin_id:       params.adminId,
    target_user_id: params.targetUserId,
    company_id:     params.companyId,
    from_plan:      params.fromPlan,
    to_plan:        params.toPlan,
    effective:      params.effective,
    reason:         params.reason ?? null,
    notes:          params.notes ?? null,
    admin_ip:       params.adminIp ?? null,
  });
}
