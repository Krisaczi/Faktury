import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { getCompanyPackage } from './get-company-package';
import { STARTER_INVOICE_LIMIT } from './types';

export interface InvoiceUsage {
  issued:         number;
  limit:          number | null;
  remaining:      number | null;
  overrideExtra:  number;
  overrideActive: boolean;
}

/**
 * Returns the monthly invoice usage for a company.
 * Counts invoices with status='issued' created in the current calendar month.
 * Includes active owner-granted overrides.
 */
export async function getMonthlyInvoiceUsage(companyId: string): Promise<InvoiceUsage> {
  const supabase = await getSupabaseServerClient();
  const pkg = await getCompanyPackage(companyId);
  const limit = pkg.features.invoices_per_month ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_monthly_invoice_usage', {
    p_company_id: companyId,
  });

  if (error || !data) {
    return { issued: 0, limit, remaining: limit, overrideExtra: 0, overrideActive: false };
  }

  const issued = Number(data.issued_count ?? 0);
  const overrideExtra = Number(data.override_extra ?? 0);
  const overrideConsumed = Number(data.override_consumed ?? 0);
  const effectiveOverride = Math.max(0, overrideExtra - overrideConsumed);

  if (limit === null) {
    return { issued, limit: null, remaining: null, overrideExtra: effectiveOverride, overrideActive: effectiveOverride > 0 };
  }

  const effectiveLimit = limit + effectiveOverride;
  const remaining = Math.max(0, effectiveLimit - issued);

  return { issued, limit, remaining, overrideExtra: effectiveOverride, overrideActive: effectiveOverride > 0 };
}

export interface InvoiceLimitResult {
  allowed:  boolean;
  reason?:  string;
  usage?:   InvoiceUsage;
}

/**
 * Checks whether a company can issue another invoice this month.
 * Returns { allowed: true } if under the limit or on an unlimited plan.
 * Returns { allowed: false, reason } if the monthly limit is reached.
 */
export async function checkInvoiceLimit(companyId: string): Promise<InvoiceLimitResult> {
  const usage = await getMonthlyInvoiceUsage(companyId);

  if (usage.limit === null) return { allowed: true, usage };

  if (usage.remaining !== null && usage.remaining > 0) {
    return { allowed: true, usage };
  }

  const limit = usage.limit;
  const overrideNote = usage.overrideExtra > 0
    ? ` (w tym ${usage.overrideExtra} dodatkowe od właściciela)`
    : '';

  return {
    allowed: false,
    usage,
    reason: `Osiągnięto miesięczny limit ${limit} wystawionych faktur${overrideNote}. Zaktualizuj plan do Professional, aby wystawiać bez limitów, lub poproś właściciela o dodatkowe faktury.`,
  };
}

/**
 * Increments the consumed count on active overrides after an invoice is issued.
 * Uses the service client to bypass RLS.
 */
export async function consumeOverride(companyId: string): Promise<void> {
  const service = getSupabaseServiceClient();

  // Find the oldest active, unconsumed override for this company this month
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: overrides } = await (service as any)
    .from('invoice_usage_overrides')
    .select('id, consumed, extra_invoices')
    .eq('company_id', companyId)
    .eq('active', true)
    .gte('created_at', dateTruncMonth())
    .order('created_at', { ascending: true })
    .limit(1);

  if (!overrides || overrides.length === 0) return;

  const ov = overrides[0];
  if (ov.consumed < ov.extra_invoices) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any)
      .from('invoice_usage_overrides')
      .update({ consumed: ov.consumed + 1, updated_at: new Date().toISOString() })
      .eq('id', ov.id);
  }
}

/**
 * Returns true if the company is on the Starter plan and has reached its
 * monthly invoice limit (including overrides). Used by the createInvoice
 * action to block issuance.
 */
export async function isInvoiceLimitReached(companyId: string): Promise<{ reached: boolean; usage?: InvoiceUsage; reason?: string }> {
  const result = await checkInvoiceLimit(companyId);
  return { reached: !result.allowed, usage: result.usage, reason: result.reason };
}

/**
 * Grants a temporary invoice allowance to a company.
 * Owner-only. Logs to invoice_usage_overrides and owner_audit_logs.
 */
export async function grantInvoiceAllowance(params: {
  ownerId:      string;
  companyId:    string;
  extraInvoices: number;
  reason?:      string;
  expiresAt?:   string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (params.extraInvoices <= 0) {
      return { ok: false, error: 'Liczba dodatkowych faktur musi być większa niż 0.' };
    }

    const service = getSupabaseServiceClient();
    const now = new Date().toISOString();
    const expiresAt = params.expiresAt ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (service as any)
      .from('invoice_usage_overrides')
      .insert({
        company_id:     params.companyId,
        granted_by:     params.ownerId,
        extra_invoices: params.extraInvoices,
        reason:         params.reason ?? null,
        expires_at:     expiresAt,
        active:         true,
        consumed:       0,
      });

    if (error) return { ok: false, error: error.message };

    // Audit log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any)
      .from('owner_audit_logs')
      .insert({
        owner_id:   params.ownerId,
        action:     'grant_invoice_allowance',
        company_id: params.companyId,
        previous:   null,
        next:       { extra_invoices: params.extraInvoices, reason: params.reason, expires_at: expiresAt },
      });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

/**
 * Gets all active overrides for a company (for display).
 */
export async function getCompanyAllowances(companyId: string): Promise<Array<{
  id:             string;
  extra_invoices: number;
  consumed:       number;
  reason:         string | null;
  expires_at:     string | null;
  active:         boolean;
  created_at:     string;
}>> {
  const service = getSupabaseServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (service as any)
    .from('invoice_usage_overrides')
    .select('id, extra_invoices, consumed, reason, expires_at, active, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(20);

  return (data ?? []) as Array<{
    id:             string;
    extra_invoices: number;
    consumed:       number;
    reason:         string | null;
    expires_at:     string | null;
    active:         boolean;
    created_at:     string;
  }>;
}

function dateTruncMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}
