'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type CompleteOnboardingResult =
  | { ok: true; companyId: string }
  | { ok: false; error: string };

export async function completeOnboarding(params: {
  companyName: string;
  nip: string | null;
  currency: 'PLN' | 'EUR' | 'USD' | 'GBP';
}): Promise<CompleteOnboardingResult> {
  const supabase = await getSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Session expired. Please sign in again.' };

  // Guard: already onboarded?
  const { data: existing } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (existing?.company_id) {
    return { ok: true, companyId: existing.company_id };
  }

  const ingestionEmail = `${slugify(params.companyName)}@invoiceguard.app`;

  // 1. Create company
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .insert({
      name: params.companyName,
      nip: params.nip || null,
      currency: params.currency,
      ingestion_email: ingestionEmail,
      subscription_status: 'trial',
    })
    .select('id')
    .single();

  if (companyError || !company) {
    return { ok: false, error: companyError?.message ?? 'Failed to create company.' };
  }

  // 2. Link user to company and set role to owner — server-side only.
  //    RLS on users.update restricts clients from changing role/company_id,
  //    but this server action runs with the session client (not service role)
  //    so we use a direct Postgres function instead to bypass the self-update
  //    restriction safely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: linkError } = await (supabase as any).rpc('complete_user_onboarding', {
    p_user_id:   user.id,
    p_company_id: company.id,
  });

  if (linkError) {
    // Best-effort rollback: delete the company we just created
    await supabase.from('companies').delete().eq('id', company.id);
    return { ok: false, error: linkError.message ?? 'Failed to link account to company.' };
  }

  return { ok: true, companyId: company.id };
}
