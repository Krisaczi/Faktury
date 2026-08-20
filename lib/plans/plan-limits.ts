import { getSupabaseServerClient } from '@/lib/supabase/server';

export interface PlanLimits {
  planId:                  string;
  displayName:             string;
  maxUsers:                number;
  invoicesPerMonth:        number | null;  // null = unlimited
  maxVendorsContractors:   number | null;  // null = unlimited
  invoiceMode:             'preview' | 'full';
  storageGb:               number | null;
  monthlyPriceCents:       number;
}

const FALLBACK_STARTER: PlanLimits = {
  planId:                'starter',
  displayName:           'Starter',
  maxUsers:              1,
  invoicesPerMonth:      10,
  maxVendorsContractors: 25,
  invoiceMode:           'full',
  storageGb:             1,
  monthlyPriceCents:     14900,
};

const FALLBACK_PROFESSIONAL: PlanLimits = {
  planId:                'professional',
  displayName:           'Professional',
  maxUsers:              3,
  invoicesPerMonth:      null,
  maxVendorsContractors: null,
  invoiceMode:           'full',
  storageGb:             10,
  monthlyPriceCents:     49900,
};

export async function getPlanLimits(planId: string): Promise<PlanLimits> {
  const supabase = await getSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('pricing_tiers')
    .select('plan_id, display_name, max_users, invoices_per_month, max_vendors_contractors, invoice_mode, storage_gb, monthly_price_cents')
    .eq('plan_id', planId)
    .maybeSingle();

  if (!data) {
    return planId === 'professional' ? FALLBACK_PROFESSIONAL : FALLBACK_STARTER;
  }

  return {
    planId:                data.plan_id ?? planId,
    displayName:           data.display_name ?? planId,
    maxUsers:              data.max_users ?? 1,
    invoicesPerMonth:      data.invoices_per_month ?? null,
    maxVendorsContractors: data.max_vendors_contractors ?? null,
    invoiceMode:           (data.invoice_mode as 'preview' | 'full') ?? 'full',
    storageGb:             data.storage_gb ?? null,
    monthlyPriceCents:     data.monthly_price_cents ?? 0,
  };
}

export async function getAllPlanLimits(): Promise<PlanLimits[]> {
  const supabase = await getSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('pricing_tiers')
    .select('plan_id, display_name, max_users, invoices_per_month, max_vendors_contractors, invoice_mode, storage_gb, monthly_price_cents')
    .order('monthly_price_cents', { ascending: true });

  if (!data || data.length === 0) {
    return [FALLBACK_STARTER, FALLBACK_PROFESSIONAL];
  }

  return data.map((d: Record<string, unknown>) => ({
    planId:                (d.plan_id as string) ?? 'starter',
    displayName:           (d.display_name as string) ?? 'Starter',
    maxUsers:              (d.max_users as number) ?? 1,
    invoicesPerMonth:      (d.invoices_per_month as number | null) ?? null,
    maxVendorsContractors: (d.max_vendors_contractors as number | null) ?? null,
    invoiceMode:           ((d.invoice_mode as string) ?? 'full') as 'preview' | 'full',
    storageGb:             (d.storage_gb as number | null) ?? null,
    monthlyPriceCents:     (d.monthly_price_cents as number) ?? 0,
  }));
}

// ─── Enforcement helpers ──────────────────────────────────────────────────────

export interface EnforcementCheck {
  allowed:  boolean;
  reason?:  string;
  code?:    string;
}

export function checkUserLimitEnforcement(
  limits: PlanLimits,
  currentUsers: number,
): EnforcementCheck {
  if (currentUsers < limits.maxUsers) return { allowed: true };
  return {
    allowed: false,
    code:    'PLAN_USER_LIMIT_REACHED',
    reason:  `Osiągnięto limit ${limits.maxUsers} użytkownik(ów) dla planu ${limits.displayName}. Przejdź na wyższy plan lub poproś właściciela o dodatkowe miejsce.`,
  };
}

export function checkVendorLimitEnforcement(
  limits: PlanLimits,
  currentVendors: number,
): EnforcementCheck {
  if (limits.maxVendorsContractors === null) return { allowed: true };
  if (currentVendors < limits.maxVendorsContractors) return { allowed: true };
  return {
    allowed: false,
    code:    'PLAN_VENDOR_LIMIT_REACHED',
    reason:  `Osiągnięto limit ${limits.maxVendorsContractors} dostawców dla planu ${limits.displayName}. Przejdź na Professional, aby dodawać bez limitów.`,
  };
}

export function checkInvoiceLimitEnforcement(
  limits: PlanLimits,
  issuedThisMonth: number,
): EnforcementCheck {
  if (limits.invoicesPerMonth === null) return { allowed: true };
  if (issuedThisMonth < limits.invoicesPerMonth) return { allowed: true };
  return {
    allowed: false,
    code:    'PLAN_INVOICE_LIMIT_REACHED',
    reason:  `Osiągnięto miesięczny limit ${limits.invoicesPerMonth} faktur dla planu ${limits.displayName}. Przejdź na Professional lub poproś właściciela o dodatkowe faktury.`,
  };
}
