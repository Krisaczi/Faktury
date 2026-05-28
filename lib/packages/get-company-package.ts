import { getSupabaseServerClient } from '@/lib/supabase/server';
import type {
  EffectivePackage,
  PackageFeatures,
  PackageTier,
  PackageType,
  CompanyUsage,
  EnforcementResult,
} from './types';
import { DEFAULT_STARTER_FEATURES } from './types';

// ─── Core resolver ────────────────────────────────────────────────────────────

export async function getCompanyPackage(companyId: string): Promise<EffectivePackage> {
  const supabase = await getSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('package_type, package_id, package_custom, package_price_cents, package_assigned_at, over_limit')
    .eq('id', companyId)
    .maybeSingle();

  if (!company) {
    return {
      type:       'starter',
      tier:       null,
      features:   DEFAULT_STARTER_FEATURES,
      priceCents: null,
      assignedAt: null,
      overLimit:  false,
    };
  }

  const packageType = (company.package_type ?? 'starter') as PackageType;

  let tier: PackageTier | null = null;
  if (company.package_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: t } = await (supabase as any)
      .from('pricing_tiers')
      .select('*')
      .eq('id', company.package_id)
      .maybeSingle();
    tier = t ?? null;
  }

  // If no tier found but type is known, try to load by key
  if (!tier && packageType !== 'individual') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: t } = await (supabase as any)
      .from('pricing_tiers')
      .select('*')
      .eq('key', packageType)
      .maybeSingle();
    tier = t ?? null;
  }

  let features: PackageFeatures;

  if (packageType === 'individual') {
    // Merge individual custom overrides on top of starter defaults
    const custom = company.package_custom as Partial<PackageFeatures> | null;
    features = { ...DEFAULT_STARTER_FEATURES, ...(custom ?? {}) };
  } else {
    features = tier
      ? (tier.features as PackageFeatures)
      : DEFAULT_STARTER_FEATURES;
  }

  return {
    type:       packageType,
    tier,
    features,
    priceCents: company.package_price_cents ?? (tier?.monthly_price_cents ?? null),
    assignedAt: company.package_assigned_at ?? null,
    overLimit:  company.over_limit ?? false,
  };
}

// ─── Usage loader ─────────────────────────────────────────────────────────────

export async function getCompanyUsage(companyId: string): Promise<CompanyUsage> {
  const supabase = await getSupabaseServerClient();

  const yearMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [companyRes, usageRes] = await Promise.all([
    (supabase as any)
      .from('companies')
      .select('vendors_count')
      .eq('id', companyId)
      .maybeSingle(),
    (supabase as any)
      .from('company_report_usage')
      .select('count')
      .eq('company_id', companyId)
      .eq('year_month', yearMonth)
      .maybeSingle(),
  ]);

  return {
    vendors_count:      (companyRes.data?.vendors_count as number) ?? 0,
    reports_this_month: (usageRes.data?.count as number) ?? 0,
  };
}

// ─── Enforcement helpers ──────────────────────────────────────────────────────

export function checkVendorLimit(
  features: PackageFeatures,
  usage: CompanyUsage,
): EnforcementResult {
  if (features.vendors_limit === null) return { allowed: true };
  if (usage.vendors_count < features.vendors_limit) return { allowed: true };
  return {
    allowed:    false,
    reason:     `Osiągnięto limit ${features.vendors_limit} dostawców dla Twojego pakietu. Zaktualizuj pakiet, aby dodać więcej.`,
    upgradeKey: 'vendors_limit',
  };
}

export function checkReportLimit(
  features: PackageFeatures,
  usage: CompanyUsage,
): EnforcementResult {
  if (features.reports_per_month === null) return { allowed: true };
  if (usage.reports_this_month < features.reports_per_month) return { allowed: true };
  return {
    allowed:    false,
    reason:     `Osiągnięto miesięczny limit ${features.reports_per_month} raportów. Zaktualizuj pakiet, aby generować więcej.`,
    upgradeKey: 'reports_per_month',
  };
}

export function checkInvoicingAccess(features: PackageFeatures): EnforcementResult {
  if (features.invoicing) return { allowed: true };
  return {
    allowed:    false,
    reason:     'Fakturowanie nie jest dostępne w Twoim pakiecie. Zaktualizuj do Pro, aby wystawiać faktury.',
    upgradeKey: 'invoicing',
  };
}

export function checkFileUploads(features: PackageFeatures): EnforcementResult {
  if (features.file_uploads) return { allowed: true };
  return {
    allowed:    false,
    reason:     'Przesyłanie plików nie jest dostępne w Twoim pakiecie.',
    upgradeKey: 'file_uploads',
  };
}

// ─── Increment report usage ────────────────────────────────────────────────────

export async function incrementReportUsage(companyId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const yearMonth = new Date().toISOString().slice(0, 7);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('company_report_usage')
    .select('id, count')
    .eq('company_id', companyId)
    .eq('year_month', yearMonth)
    .maybeSingle();

  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('company_report_usage')
      .update({ count: (existing.count as number) + 1, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('company_report_usage')
      .insert({ company_id: companyId, year_month: yearMonth, count: 1 });
  }
}
