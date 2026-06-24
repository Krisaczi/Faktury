'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OnboardingStep = 'start' | 'company_created' | 'product_selected';

export interface OnboardingState {
  step:      OnboardingStep;
  companyId: string | null;
  /** Populated when step === 'company_created' to pre-fill Step 2 */
  productType: 'starter' | 'professional' | null;
}

export type ActionResult<T = void> =
  | { ok: true;  data: T }
  | { ok: false; error: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── getOnboardingState ───────────────────────────────────────────────────────
/**
 * Reads the current onboarding progress for the authenticated user.
 * Used by the page on mount to decide which step to render.
 */
export async function getOnboardingState(): Promise<ActionResult<OnboardingState>> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesja wygasła. Zaloguj się ponownie.' };

  const { data: row } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!row?.company_id) {
    return { ok: true, data: { step: 'start', companyId: null, productType: null } };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('onboarding_step, product_type')
    .eq('id', row.company_id)
    .maybeSingle();

  if (!company) {
    return { ok: true, data: { step: 'start', companyId: null, productType: null } };
  }

  const dbStep = company.onboarding_step as string | null;

  if (dbStep === 'product_selected') {
    return {
      ok: true,
      data: {
        step:        'product_selected',
        companyId:   row.company_id,
        productType: company.product_type as 'starter' | 'professional' | null,
      },
    };
  }

  // Either 'company_created' or NULL (legacy partial row) — send to step 2
  return {
    ok: true,
    data: {
      step:        'company_created',
      companyId:   row.company_id,
      productType: company.product_type as 'starter' | 'professional' | null,
    },
  };
}

// ─── createCompany ────────────────────────────────────────────────────────────
/**
 * Step 1: persist company row and link the calling user as owner.
 * Sets onboarding_step = 'company_created'.
 * Idempotent: if the user already has a company_id, returns it unchanged.
 */
export async function createCompany(params: {
  companyName: string;
  nip:         string;
  street:      string;
  zip:         string;
  city:        string;
  currency:    'PLN' | 'EUR' | 'USD' | 'GBP';
}): Promise<ActionResult<{ companyId: string; step: OnboardingStep }>> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesja wygasła. Zaloguj się ponownie.' };

  // Idempotency: already linked?
  const { data: existingUser } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (existingUser?.company_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingCompany } = await (supabase as any)
      .from('companies')
      .select('onboarding_step')
      .eq('id', existingUser.company_id)
      .maybeSingle();

    const existingStep = (existingCompany?.onboarding_step ?? 'company_created') as OnboardingStep;
    return {
      ok:   true,
      data: { companyId: existingUser.company_id, step: existingStep },
    };
  }

  const ingestionEmail = `${slugify(params.companyName)}@invoiceguard.app`;
  // Generate the ID client-side so we don't need .select() after insert.
  // Chaining .select('id').single() after insert triggers a PostgREST RLS
  // violation because the SELECT policy can't see the row before the user
  // is linked to the company (get_user_company_id() is still NULL at that point).
  const companyId = crypto.randomUUID();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: companyError } = await (supabase as any)
    .from('companies')
    .insert({
      id:               companyId,
      name:             params.companyName,
      nip:              params.nip,
      street:           params.street,
      zip:              params.zip,
      city:             params.city,
      currency:         params.currency,
      ingestion_email:  ingestionEmail,
      onboarding_step:  'company_created',
    });

  if (companyError) {
    return { ok: false, error: companyError.message };
  }

  // Link user as owner
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: linkError } = await (supabase as any).rpc('complete_user_onboarding', {
    p_user_id:    user.id,
    p_company_id: companyId,
  });

  if (linkError) {
    // Best-effort rollback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('companies').delete().eq('id', companyId);
    return { ok: false, error: linkError.message ?? 'Nie udało się powiązać konta z firmą.' };
  }

  return { ok: true, data: { companyId, step: 'company_created' } };
}

// ─── finalizeProduct ──────────────────────────────────────────────────────────
/**
 * Step 2: set product_type, trial state, and mark onboarding_step = 'product_selected'.
 * Wraps the existing selectProduct logic directly here so the onboarding page
 * has a single, cohesive action surface without depending on the admin actions module.
 */
export async function finalizeProduct(params: {
  companyId:   string;
  productType: 'starter' | 'professional';
  trialActive: boolean;
}): Promise<ActionResult<{ companyId: string }>> {
  const { companyId, productType, trialActive } = params;

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesja wygasła. Zaloguj się ponownie.' };

  // Verify caller owns this company
  const { data: row } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (row?.company_id !== companyId) {
    return { ok: false, error: 'Brak uprawnień do tej firmy.' };
  }

  const now            = new Date();
  const trialExpiresAt = trialActive
    ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('companies')
    .update({
      product_type:        productType,
      package_type:        productType,
      trial_active:        trialActive,
      trial_expires_at:    trialExpiresAt,
      subscription_status: trialActive ? 'trial' : 'active',
      onboarding_step:     'product_selected',
      updated_at:          now.toISOString(),
    })
    .eq('id', companyId);

  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { companyId } };
}

// ─── completeOnboarding (kept for backward compat) ───────────────────────────
/**
 * Legacy single-step submit — still used by older clients. Internally delegates
 * to createCompany + finalizeProduct so logic stays in one place.
 */
export type CompleteOnboardingResult =
  | { ok: true; companyId: string }
  | { ok: false; error: string };

export async function completeOnboarding(params: {
  companyName: string;
  nip:         string;
  street:      string;
  zip:         string;
  city:        string;
  currency:    'PLN' | 'EUR' | 'USD' | 'GBP';
  productType: 'starter' | 'professional';
  trialActive: boolean;
}): Promise<CompleteOnboardingResult> {
  const step1 = await createCompany({
    companyName: params.companyName,
    nip:         params.nip,
    street:      params.street,
    zip:         params.zip,
    city:        params.city,
    currency:    params.currency,
  });

  if (!step1.ok) return step1;

  const step2 = await finalizeProduct({
    companyId:   step1.data.companyId,
    productType: params.productType,
    trialActive: params.trialActive,
  });

  if (!step2.ok) return step2;

  return { ok: true, companyId: step1.data.companyId };
}
