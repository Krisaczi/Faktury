'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { CustomPricingSchema } from '@/app/(admin)/admin/owner/types';
import type {
  OwnerDashboardData,
  CompanyDashboardRow,
  RevenueTrendRow,
  PricingTier,
  OwnerAuditLog,
  OwnerActionResult,
  CustomPricing,
} from '@/app/(admin)/admin/owner/types';

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function requireOwnerUser() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: u } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (u?.role !== 'owner') throw new Error('Brak uprawnień właściciela.');
  return { user, supabase };
}

// ─── Audit helper ─────────────────────────────────────────────────────────────

async function writeAudit(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  ownerId: string,
  action: string,
  companyId: string | null,
  previous: Record<string, unknown> | null,
  next: Record<string, unknown> | null,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('owner_audit_logs')
    .insert({ owner_id: ownerId, action, company_id: companyId, previous, next });
}

// ─── FETCH DASHBOARD ─────────────────────────────────────────────────────────

export async function getOwnerDashboard(trendMonths = 12): Promise<OwnerDashboardData> {
  const { supabase } = await requireOwnerUser();

  const [statsRes, trendRes, tiersRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_owner_dashboard_stats'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_owner_revenue_trend', { p_months: trendMonths }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('pricing_tiers').select('*').order('monthly_price_cents'),
  ]);

  const companies: CompanyDashboardRow[] = (statsRes.data ?? []).map((r: Record<string, unknown>) => ({
    company_id:          String(r.company_id),
    company_name:        String(r.company_name ?? ''),
    nip:                 r.nip ? String(r.nip) : null,
    is_active:           Boolean(r.is_active ?? true),
    inactive_reason:     r.inactive_reason ? String(r.inactive_reason) : null,
    pricing_tier_name:   r.pricing_tier_name ? String(r.pricing_tier_name) : null,
    pricing_tier_id:     r.pricing_tier_id  ? String(r.pricing_tier_id)  : null,
    custom_pricing:      r.custom_pricing as CustomPricing | null,
    subscription_status: String(r.subscription_status ?? 'trial'),
    product_type:        (r.product_type as 'starter' | 'professional' | null) ?? null,
    trial_active:        Boolean(r.trial_active ?? false),
    trial_expires_at:    r.trial_expires_at ? String(r.trial_expires_at) : null,
    created_at:          String(r.created_at ?? ''),
    invoices_30d:        Number(r.invoices_30d  ?? 0),
    invoices_90d:        Number(r.invoices_90d  ?? 0),
    invoices_365d:       Number(r.invoices_365d ?? 0),
    net_total_30d:       Number(r.net_total_30d  ?? 0),
    gross_total_30d:     Number(r.gross_total_30d ?? 0),
    last_invoice_date:   r.last_invoice_date ? String(r.last_invoice_date) : null,
    vendors_count:       Number(r.vendors_count ?? 0),
    users_count:         Number(r.users_count   ?? 0),
  }));

  const trend: RevenueTrendRow[] = (trendRes.data ?? []).map((r: Record<string, unknown>) => ({
    month:            String(r.month),
    total_invoices:   Number(r.total_invoices ?? 0),
    net_total:        Number(r.net_total      ?? 0),
    gross_total:      Number(r.gross_total    ?? 0),
    active_companies: Number(r.active_companies ?? 0),
  }));

  const pricingTiers: PricingTier[] = (tiersRes.data ?? []).map((t: Record<string, unknown>) => ({
    id:                  String(t.id),
    name:                String(t.name),
    monthly_price_cents: Number(t.monthly_price_cents ?? 0),
    annual_price_cents:  Number(t.annual_price_cents  ?? 0),
    limits:              (t.limits as Record<string, number | null>) ?? {},
    created_at:          String(t.created_at ?? ''),
    updated_at:          String(t.updated_at ?? ''),
  }));

  const totalNet30d   = companies.reduce((s, c) => s + c.net_total_30d, 0);
  const totalInv30d   = companies.reduce((s, c) => s + c.invoices_30d, 0);
  const totalVendors  = companies.reduce((s, c) => s + c.vendors_count, 0);
  const totalUsers    = companies.reduce((s, c) => s + c.users_count, 0);

  return {
    companies,
    trend,
    pricingTiers,
    kpi: {
      total_companies:    companies.length,
      active_companies:   companies.filter((c) => c.is_active).length,
      total_invoices_30d: totalInv30d,
      total_net_30d:      totalNet30d,
      total_vendors:      totalVendors,
      total_users:        totalUsers,
    },
  };
}

// ─── ASSIGN PRICING TIER ─────────────────────────────────────────────────────

export async function assignPricingTier(
  companyId: string,
  tierId: string | null,
  customPricing?: CustomPricing | null,
): Promise<OwnerActionResult> {
  try {
    const { user, supabase } = await requireOwnerUser();

    if (customPricing) {
      const parsed = CustomPricingSchema.safeParse(customPricing);
      if (!parsed.success) return { ok: false, error: 'Nieprawidłowe dane cennika.' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prev } = await (supabase as any)
      .from('companies')
      .select('pricing_tier_id, custom_pricing')
      .eq('id', companyId)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('companies')
      .update({
        pricing_tier_id: tierId ?? null,
        custom_pricing:  customPricing ?? null,
        updated_at:      new Date().toISOString(),
      })
      .eq('id', companyId);

    if (error) return { ok: false, error: error.message };

    await writeAudit(supabase, user.id, 'assign_pricing_tier', companyId, prev, { pricing_tier_id: tierId, custom_pricing: customPricing });
    revalidatePath('/admin/owner');
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── SET COMPANY ACTIVE STATE ─────────────────────────────────────────────────

export async function setCompanyActiveState(
  companyId: string,
  isActive: boolean,
  reason?: string,
): Promise<OwnerActionResult> {
  try {
    const { user, supabase } = await requireOwnerUser();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prev } = await (supabase as any)
      .from('companies')
      .select('is_active, inactive_reason, inactive_at')
      .eq('id', companyId)
      .maybeSingle();

    const update: Record<string, unknown> = {
      is_active:       isActive,
      inactive_reason: isActive ? null : (reason ?? null),
      inactive_at:     isActive ? null : new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('companies')
      .update(update)
      .eq('id', companyId);

    if (error) return { ok: false, error: error.message };

    await writeAudit(
      supabase,
      user.id,
      isActive ? 'activate_company' : 'deactivate_company',
      companyId,
      prev,
      update,
    );
    revalidatePath('/admin/owner');
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── BULK ASSIGN PRICING TIER ─────────────────────────────────────────────────

export async function bulkAssignPricingTier(
  companyIds: string[],
  tierId: string,
): Promise<OwnerActionResult<number>> {
  try {
    const { user, supabase } = await requireOwnerUser();
    if (companyIds.length === 0) return { ok: true, data: 0 };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, count } = await (supabase as any)
      .from('companies')
      .update({ pricing_tier_id: tierId, updated_at: new Date().toISOString() })
      .in('id', companyIds);

    if (error) return { ok: false, error: error.message };

    await writeAudit(supabase, user.id, 'bulk_assign_pricing_tier', null, null, { company_ids: companyIds, tier_id: tierId });
    revalidatePath('/admin/owner');
    return { ok: true, data: count ?? companyIds.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── BULK DEACTIVATE ─────────────────────────────────────────────────────────

export async function bulkDeactivateCompanies(
  companyIds: string[],
  reason: string,
): Promise<OwnerActionResult<number>> {
  try {
    const { user, supabase } = await requireOwnerUser();
    if (companyIds.length === 0) return { ok: true, data: 0 };

    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, count } = await (supabase as any)
      .from('companies')
      .update({ is_active: false, inactive_reason: reason, inactive_at: now, updated_at: now })
      .in('id', companyIds);

    if (error) return { ok: false, error: error.message };

    await writeAudit(supabase, user.id, 'bulk_deactivate', null, null, { company_ids: companyIds, reason });
    revalidatePath('/admin/owner');
    return { ok: true, data: count ?? companyIds.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── GET AUDIT LOGS ───────────────────────────────────────────────────────────

export async function getOwnerAuditLogs(limit = 50): Promise<OwnerAuditLog[]> {
  const { user, supabase } = await requireOwnerUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('owner_audit_logs')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []) as OwnerAuditLog[];
}
