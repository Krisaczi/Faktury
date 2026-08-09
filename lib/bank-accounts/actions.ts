'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { validateIban, validateBic, normalizeIban } from '@/lib/validations/iban';
import type { AppRole } from '@/lib/permissions';
import type {
  BankAccountRow,
  CreateBankAccountInput,
  UpdateBankAccountPatch,
  BankAccountActionResult,
  DeleteBankAccountResult,
} from './types';

// ─── Auth helper ──────────────────────────────────────────────────────────────

interface AuthContext {
  userId: string;
  companyId: string;
  role: AppRole;
}

async function requireCompanyAdmin(): Promise<AuthContext> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: u } = await (supabase as any)
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) throw new Error('No company');
  const role = (u.role ?? 'accountant') as AppRole;
  if (role !== 'owner') {
    throw new Error('Brak uprawnień. Wymagana rola owner.');
  }

  return { userId: user.id, companyId: u.company_id as string, role };
}

async function requireCompanyMember(): Promise<AuthContext> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: u } = await (supabase as any)
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) throw new Error('No company');
  const role = (u.role ?? 'accountant') as AppRole;

  return { userId: user.id, companyId: u.company_id as string, role };
}

// ─── Audit helper ─────────────────────────────────────────────────────────────

async function auditLog(
  supabase: ReturnType<typeof getSupabaseServerClient> extends Promise<infer T> ? T : never,
  companyId: string,
  userId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('settings_audit').insert({
      company_id: companyId,
      user_id: userId,
      action,
      metadata,
    });
  } catch {
    // Audit logging is best-effort — don't fail the operation
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listCompanyBankAccounts(): Promise<BankAccountRow[]> {
  const { companyId } = await requireCompanyMember();
  const supabase = await getSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('company_bank_accounts')
    .select('*')
    .eq('company_id', companyId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as BankAccountRow[];
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createCompanyBankAccount(
  input: CreateBankAccountInput,
): Promise<BankAccountActionResult> {
  try {
    const { userId, companyId } = await requireCompanyAdmin();
    const supabase = await getSupabaseServerClient();

    // Validate IBAN
    const ibanError = validateIban(input.iban);
    if (ibanError) return { ok: false, error: ibanError, fieldErrors: { iban: ibanError } };

    // Validate BIC if provided
    if (input.bic) {
      const bicError = validateBic(input.bic);
      if (bicError) return { ok: false, error: bicError, fieldErrors: { bic: bicError } };
    }

    if (!input.account_holder_name?.trim()) {
      return { ok: false, error: 'Nazwa posiadacza konta jest wymagana.', fieldErrors: { account_holder_name: 'Wymagane' } };
    }

    const iban = normalizeIban(input.iban);

    // If is_default, unset other defaults first
    if (input.is_default) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('company_bank_accounts')
        .update({ is_default: false })
        .eq('company_id', companyId)
        .eq('is_default', true);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('company_bank_accounts')
      .insert({
        company_id: companyId,
        account_holder_name: input.account_holder_name.trim(),
        iban,
        bic: input.bic?.trim().toUpperCase() || null,
        bank_name: input.bank_name?.trim() || null,
        is_default: input.is_default ?? false,
        verified: false,
        metadata: input.metadata ?? null,
        created_by: userId,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return { ok: false, error: 'Konto bankowe z tym numerem IBAN już istnieje.', fieldErrors: { iban: 'Duplikat' } };
      }
      return { ok: false, error: error.message };
    }

    await auditLog(supabase, companyId, userId, 'bank_account_created', {
      account_id: data.id,
      iban_masked: `••••${iban.slice(-4)}`,
    });

    return { ok: true, account: data as BankAccountRow };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateCompanyBankAccount(
  accountId: string,
  patch: UpdateBankAccountPatch,
): Promise<BankAccountActionResult> {
  try {
    const { userId, companyId } = await requireCompanyAdmin();
    const supabase = await getSupabaseServerClient();

    // Verify account belongs to this company
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('company_bank_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!existing) return { ok: false, error: 'Konto bankowe nie istnieje lub brak dostępu.' };

    // Validate BIC if being updated
    if (patch.bic !== undefined && patch.bic) {
      const bicError = validateBic(patch.bic);
      if (bicError) return { ok: false, error: bicError, fieldErrors: { bic: bicError } };
    }

    if (patch.account_holder_name !== undefined && !patch.account_holder_name?.trim()) {
      return { ok: false, error: 'Nazwa posiadacza konta jest wymagana.' };
    }

    // If setting is_default, unset other defaults
    if (patch.is_default === true) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('company_bank_accounts')
        .update({ is_default: false })
        .eq('company_id', companyId)
        .eq('is_default', true)
        .neq('id', accountId);
    }

    const updateData: Record<string, unknown> = {};
    if (patch.account_holder_name !== undefined) updateData.account_holder_name = patch.account_holder_name.trim();
    if (patch.bic !== undefined) updateData.bic = patch.bic?.trim().toUpperCase() || null;
    if (patch.bank_name !== undefined) updateData.bank_name = patch.bank_name?.trim() || null;
    if (patch.is_default !== undefined) updateData.is_default = patch.is_default;
    if (patch.metadata !== undefined) updateData.metadata = patch.metadata;
    if (patch.verified !== undefined) updateData.verified = patch.verified;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('company_bank_accounts')
      .update(updateData)
      .eq('id', accountId)
      .select('*')
      .single();

    if (error) return { ok: false, error: error.message };

    await auditLog(supabase, companyId, userId, 'bank_account_updated', {
      account_id: accountId,
      before: { is_default: existing.is_default, verified: existing.verified },
      after: { is_default: data.is_default, verified: data.verified },
    });

    return { ok: true, account: data as BankAccountRow };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteCompanyBankAccount(
  accountId: string,
  force: boolean = false,
): Promise<DeleteBankAccountResult> {
  try {
    const { userId, companyId, role } = await requireCompanyAdmin();
    const supabase = await getSupabaseServerClient();

    // Verify account belongs to this company
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('company_bank_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!existing) return { ok: false, error: 'Konto bankowe nie istnieje lub brak dostępu.' };

    // Check if referenced by issued invoices
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from('issued_invoices')
      .select('id', { count: 'exact', head: true })
      .eq('company_bank_account_id', accountId);

    if (count > 0 && !force) {
      return {
        ok: false,
        error: `To konto jest używane przez ${count} faktur(ę). Usunięcie wymaga potwierdzenia przez właściciela.`,
        requiresOwnerConfirm: true,
      };
    }

    if (count > 0 && force && role !== 'owner') {
      return {
        ok: false,
        error: 'Usunięcie konta używanego przez faktury wymaga roli właściciela.',
        requiresOwnerConfirm: true,
      };
    }

    // If deleting the default account, promote the most recent other account
    if (existing.is_default) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: next } = await (supabase as any)
        .from('company_bank_accounts')
        .select('id')
        .eq('company_id', companyId)
        .neq('id', accountId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (next) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('company_bank_accounts')
          .update({ is_default: true })
          .eq('id', next.id);
      }
    }

    // Null out FK on invoices referencing this account
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('issued_invoices')
      .update({ company_bank_account_id: null })
      .eq('company_bank_account_id', accountId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('company_bank_accounts')
      .delete()
      .eq('id', accountId);

    if (error) return { ok: false, error: error.message };

    await auditLog(supabase, companyId, userId, 'bank_account_deleted', {
      account_id: accountId,
      iban_masked: `••••${existing.iban.slice(-4)}`,
      invoices_referenced: count,
      forced: force,
    });

    return { ok: true, id: accountId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export async function verifyCompanyBankAccount(
  accountId: string,
): Promise<BankAccountActionResult> {
  try {
    const { userId, companyId } = await requireCompanyAdmin();
    const supabase = await getSupabaseServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('company_bank_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!existing) return { ok: false, error: 'Konto bankowe nie istnieje lub brak dostępu.' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('company_bank_accounts')
      .update({ verified: true })
      .eq('id', accountId)
      .select('*')
      .single();

    if (error) return { ok: false, error: error.message };

    await auditLog(supabase, companyId, userId, 'bank_account_verified', {
      account_id: accountId,
      iban_masked: `••••${existing.iban.slice(-4)}`,
    });

    return { ok: true, account: data as BankAccountRow };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}
