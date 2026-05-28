'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { AssignPackageSchema, IndividualOptionsSchema } from './types';
import type {
  AssignPackageInput,
  IndividualOptions,
  PackageActionResult,
  PackageAuditEntry,
  EffectivePackage,
  CompanyUsage,
} from './types';
import {
  getCompanyPackage,
  getCompanyUsage,
} from './get-company-package';

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function requireOwnerOrAdmin(companyId?: string) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: u } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!u) throw new Error('Użytkownik nie istnieje.');
  if (!['owner', 'admin'].includes(u.role ?? '')) {
    throw new Error('Brak uprawnień do zarządzania pakietami.');
  }
  if (companyId && u.company_id !== companyId && u.role !== 'owner') {
    throw new Error('Brak dostępu do tej firmy.');
  }

  return { user, supabase, userCompanyId: u.company_id as string, role: u.role as string };
}

// ─── Audit helper ─────────────────────────────────────────────────────────────

async function writePackageAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
  changedBy: string,
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
  reason?: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('company_package_audit')
    .insert({ company_id: companyId, changed_by: changedBy, previous, next, reason: reason ?? null });
}

// ─── Get package + usage (server action for client use) ───────────────────────

export async function getCompanyPackageWithUsage(companyId: string): Promise<{
  pkg: EffectivePackage;
  usage: CompanyUsage;
}> {
  const [pkg, usage] = await Promise.all([
    getCompanyPackage(companyId),
    getCompanyUsage(companyId),
  ]);
  return { pkg, usage };
}

// ─── Get pricing tiers (for modals) ──────────────────────────────────────────

export async function getPricingTiers() {
  const supabase = await getSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pricing_tiers')
    .select('*')
    .order('monthly_price_cents', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string; key: string; name: string;
    monthly_price_cents: number; annual_price_cents: number;
    features: Record<string, unknown>;
    created_at: string; updated_at: string;
  }>;
}

// ─── Get package audit log ────────────────────────────────────────────────────

export async function getCompanyPackageAudit(companyId: string, limit = 20): Promise<PackageAuditEntry[]> {
  const supabase = await getSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('company_package_audit')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []) as PackageAuditEntry[];
}

// ─── Assign package ───────────────────────────────────────────────────────────

export async function assignPackageToCompany(
  companyId: string,
  input: AssignPackageInput,
): Promise<PackageActionResult> {
  try {
    const { user, supabase } = await requireOwnerOrAdmin(companyId);

    const parsed = AssignPackageSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Nieprawidłowe dane pakietu.' };
    }
    const d = parsed.data;

    // If assigning a named tier (starter/pro), resolve the tier id
    let tierId = d.package_id ?? null;
    if (!tierId && d.package_type !== 'individual') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: tier } = await (supabase as any)
        .from('pricing_tiers')
        .select('id')
        .eq('key', d.package_type)
        .maybeSingle();
      tierId = tier?.id ?? null;
    }

    // Read previous state for audit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prev } = await (supabase as any)
      .from('companies')
      .select('package_type, package_id, package_custom, package_price_cents, over_limit')
      .eq('id', companyId)
      .maybeSingle();

    // Check for over_limit condition when downgrading
    let overLimit = false;
    if (d.package_type !== 'pro') {
      const usage = await getCompanyUsage(companyId);
      const newFeatures = d.package_type === 'individual'
        ? d.package_custom
        : null; // will be read from tier on next load

      if (d.package_type === 'individual' && newFeatures?.vendors_limit !== null && newFeatures?.vendors_limit !== undefined) {
        overLimit = usage.vendors_count > newFeatures.vendors_limit;
      } else if (d.package_type === 'starter') {
        overLimit = usage.vendors_count > 25;
      }
    }

    const updatePayload: Record<string, unknown> = {
      package_type:          d.package_type,
      package_id:            tierId,
      package_custom:        d.package_type === 'individual' ? (d.package_custom ?? null) : null,
      package_price_cents:   d.package_price_cents ?? null,
      package_assigned_at:   new Date().toISOString(),
      over_limit:            overLimit,
      updated_at:            new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('companies')
      .update(updatePayload)
      .eq('id', companyId);

    if (error) return { ok: false, error: error.message };

    await writePackageAudit(
      supabase,
      companyId,
      user.id,
      prev ?? null,
      updatePayload,
      d.reason,
    );

    revalidatePath(`/admin/companies/${companyId}`);
    revalidatePath('/admin/owner');
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── Update Individual options ────────────────────────────────────────────────

export async function updateIndividualPackageOptions(
  companyId: string,
  options: IndividualOptions,
  reason?: string,
): Promise<PackageActionResult> {
  try {
    const { user, supabase } = await requireOwnerOrAdmin(companyId);

    const parsed = IndividualOptionsSchema.safeParse(options);
    if (!parsed.success) {
      return { ok: false, error: 'Nieprawidłowe opcje pakietu Individual.' };
    }
    const d = parsed.data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prev } = await (supabase as any)
      .from('companies')
      .select('package_type, package_custom, vendors_count')
      .eq('id', companyId)
      .maybeSingle();

    if (prev?.package_type !== 'individual') {
      return { ok: false, error: 'Firma nie ma pakietu Individual.' };
    }

    // Check over_limit when reducing vendors_limit
    const overLimit = d.vendors_limit !== null && (prev.vendors_count as number) > d.vendors_limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('companies')
      .update({
        package_custom: d,
        over_limit:     overLimit,
        updated_at:     new Date().toISOString(),
      })
      .eq('id', companyId);

    if (error) return { ok: false, error: error.message };

    await writePackageAudit(
      supabase,
      companyId,
      user.id,
      { package_custom: prev.package_custom },
      { package_custom: d, over_limit: overLimit },
      reason,
    );

    revalidatePath(`/admin/companies/${companyId}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── Create / update a pricing tier (admin) ───────────────────────────────────

export async function upsertPricingTier(input: {
  id?: string;
  key: string;
  name: string;
  monthly_price_cents: number;
  annual_price_cents: number;
  features: Record<string, unknown>;
}): Promise<PackageActionResult> {
  try {
    const { supabase } = await requireOwnerOrAdmin();

    if (input.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('pricing_tiers')
        .update({
          key:                 input.key,
          name:                input.name,
          monthly_price_cents: input.monthly_price_cents,
          annual_price_cents:  input.annual_price_cents,
          features:            input.features,
          updated_at:          new Date().toISOString(),
        })
        .eq('id', input.id);
      if (error) return { ok: false, error: error.message };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('pricing_tiers')
        .insert({
          key:                 input.key,
          name:                input.name,
          monthly_price_cents: input.monthly_price_cents,
          annual_price_cents:  input.annual_price_cents,
          features:            input.features,
        });
      if (error) return { ok: false, error: error.message };
    }

    revalidatePath('/admin/owner/tiers');
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}
