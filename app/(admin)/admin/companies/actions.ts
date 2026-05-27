'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { BuyerCompanySchema, ContactSchema } from '@/app/(admin)/admin/companies/types';
import type {
  ActionResult,
  BuyerCompany,
  BuyerCompanyContact,
  BuyerCompanyWithInvoiceCount,
  BuyerCompanyDetail,
  BuyerCompanyFormValues,
  ContactFormValues,
  GetCompaniesParams,
  GetCompaniesResult,
} from '@/app/(admin)/admin/companies/types';
import type { AppRole } from '@/lib/permissions';

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function requireOwner() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: u } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) throw new Error('Brak przypisanej firmy.');
  if (u.role !== 'owner') throw new Error('Tylko właściciel może zarządzać kontrahentami.');

  return { user, companyId: u.company_id as string, role: u.role as AppRole, supabase };
}

async function requireCompanyMember() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: u } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) throw new Error('Brak przypisanej firmy.');
  return { user, companyId: u.company_id as string, role: u.role as AppRole, supabase };
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export async function createBuyerCompany(
  values: BuyerCompanyFormValues
): Promise<ActionResult<BuyerCompany>> {
  try {
    const { user, companyId, supabase } = await requireOwner();

    const parsed = BuyerCompanySchema.safeParse(values);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Nieprawidłowe dane.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const d = parsed.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('buyer_companies')
      .insert({
        company_id:                 companyId,
        owner_id:                   user.id,
        name:                       d.name,
        nip:                        d.nip || null,
        vat_payer:                  d.vat_payer ?? true,
        street:                     d.street || null,
        postal_code:                d.postal_code || null,
        city:                       d.city || null,
        country:                    d.country || 'Polska',
        email:                      d.email || null,
        phone:                      d.phone || null,
        billing_email:              d.billing_email || null,
        default_payment_terms_days: d.default_payment_terms_days ?? 14,
        default_payment_method:     d.default_payment_method ?? 'transfer',
        notes:                      d.notes || null,
      })
      .select('*')
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? 'Błąd zapisu.' };

    revalidatePath('/admin/companies');
    return { ok: true, data: data as BuyerCompany };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export async function updateBuyerCompany(
  id: string,
  values: BuyerCompanyFormValues
): Promise<ActionResult<BuyerCompany>> {
  try {
    const { supabase } = await requireOwner();

    const parsed = BuyerCompanySchema.safeParse(values);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Nieprawidłowe dane.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const d = parsed.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('buyer_companies')
      .update({
        name:                       d.name,
        nip:                        d.nip || null,
        vat_payer:                  d.vat_payer ?? true,
        street:                     d.street || null,
        postal_code:                d.postal_code || null,
        city:                       d.city || null,
        country:                    d.country || 'Polska',
        email:                      d.email || null,
        phone:                      d.phone || null,
        billing_email:              d.billing_email || null,
        default_payment_terms_days: d.default_payment_terms_days ?? 14,
        default_payment_method:     d.default_payment_method ?? 'transfer',
        notes:                      d.notes || null,
        updated_at:                 new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? 'Błąd aktualizacji.' };

    revalidatePath('/admin/companies');
    revalidatePath(`/admin/companies/${id}`);
    return { ok: true, data: data as BuyerCompany };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── SOFT DELETE ──────────────────────────────────────────────────────────────

export async function deleteBuyerCompany(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase } = await requireOwner();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('buyer_companies')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return { ok: false, error: error.message };
    revalidatePath('/admin/companies');
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── LIST ─────────────────────────────────────────────────────────────────────

export async function getBuyerCompanies(
  params: GetCompaniesParams = {}
): Promise<GetCompaniesResult> {
  const { supabase } = await requireCompanyMember();
  const {
    page     = 1,
    pageSize = 25,
    search,
    sortBy   = 'created_at',
    sortDir  = 'desc',
  } = params;

  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('buyer_companies')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order(sortBy, { ascending: sortDir === 'asc' })
    .range(from, to);

  if (search) {
    query = query.or(`name.ilike.%${search}%,nip.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  const rows = ((data ?? []) as BuyerCompany[]).map((r) => ({ ...r, invoice_count: 0 }));
  return { rows, totalCount: count ?? 0 };
}

// ─── GET BY ID ────────────────────────────────────────────────────────────────

export async function getBuyerCompanyById(id: string): Promise<BuyerCompanyDetail | null> {
  const { supabase } = await requireCompanyMember();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('buyer_companies')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!company) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contacts } = await (supabase as any)
    .from('buyer_company_contacts')
    .select('*')
    .eq('company_id', id)
    .order('created_at', { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: invoiceCount } = await (supabase as any)
    .from('issued_invoices')
    .select('*', { count: 'exact', head: true })
    .eq('buyer_nip', company.nip ?? '____no_nip____');

  return {
    company:      company as BuyerCompany,
    contacts:     (contacts ?? []) as BuyerCompanyContact[],
    invoiceCount: invoiceCount ?? 0,
  };
}

// ─── CONTACTS ─────────────────────────────────────────────────────────────────

export async function upsertBuyerCompanyContact(
  buyerCompanyId: string,
  values: ContactFormValues,
  contactId?: string
): Promise<ActionResult<BuyerCompanyContact>> {
  try {
    const { supabase } = await requireOwner();

    const parsed = ContactSchema.safeParse(values);
    if (!parsed.success) return { ok: false, error: 'Nieprawidłowe dane kontaktu.' };

    const d = parsed.data;
    const payload = {
      company_id: buyerCompanyId,
      name:       d.name,
      email:      d.email || null,
      phone:      d.phone || null,
      role:       d.role  || null,
      updated_at: new Date().toISOString(),
    };

    const q = contactId
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (supabase as any).from('buyer_company_contacts').update(payload).eq('id', contactId).select('*').single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : (supabase as any).from('buyer_company_contacts').insert(payload).select('*').single();

    const { data, error } = await q;
    if (error || !data) return { ok: false, error: error?.message ?? 'Błąd zapisu kontaktu.' };

    revalidatePath(`/admin/companies/${buyerCompanyId}`);
    return { ok: true, data: data as BuyerCompanyContact };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

export async function deleteBuyerCompanyContact(
  buyerCompanyId: string,
  contactId: string
): Promise<ActionResult<null>> {
  try {
    const { supabase } = await requireOwner();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('buyer_company_contacts')
      .delete()
      .eq('id', contactId);

    if (error) return { ok: false, error: error.message };
    revalidatePath(`/admin/companies/${buyerCompanyId}`);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}
