'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { generateInvoiceNumber } from '@/lib/invoice-number';
import {
  IssuedInvoiceSchema,
  IssuedInvoiceItemSchema,
  computeItemAmounts,
  computeInvoiceTotals,
  isDeletable,
  isEditable,
  isSubmittable,
  EDITABLE_INVOICE_STATUSES,
  type IssuedInvoiceInput,
} from '@/types/issued-invoice';
import { findSubmissionIssues, type InvoiceValidationIssue } from '@/lib/invoices/validate-invoice';
import { buildKsefPayload } from '@/lib/ksef';
import { submitToKsef, checkKsefStatus as pollKsefStatus, generateIdempotencyKey } from '@/lib/ksef/submit';
import {
  canAccessInvoicing,
  canWriteInvoice,
  canIssueInvoice,
  canSendToKsef as canSendToKsefRole,
  type AppRole,
} from '@/lib/permissions';
import { requireInvoicingEnabled } from '@/lib/packages/get-company-package';
import { checkInvoiceLimit, consumeOverride } from '@/lib/packages/invoice-limit';
import { isOwner as isOwnerUser } from '@/lib/auth/is-owner';
import {
  BillingAddressSchema,
  companyAddressToBilling,
  billingAddressToString,
  type BillingAddress,
  type CompanyAddressRow,
} from '@/lib/invoice-address';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive action-level server result (never throws on validation errors) */
export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; id?: string; error: string; fieldErrors?: Record<string, string[]>; issues?: InvoiceValidationIssue[] };

/** Fetch the current user with their role and company. Throws on auth failure. */
async function requireInvoicingUser() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: u } = await supabase
    .from('users')
    .select('role, company_id, is_owner, email')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) throw new Error('No company');
  const role = (u.role ?? 'accountant') as AppRole;

  // Fetch the company's package so role-based invoicing checks are package-aware
  const { data: company } = await supabase
    .from('companies')
    .select('product_type')
    .eq('id', u.company_id)
    .maybeSingle();
  const packageType = company?.product_type ?? null;

  if (!canAccessInvoicing(role, packageType)) throw new Error('Brak dostępu do modułu fakturowania.');

  // Owner bypass: skip package-level enforcement for owner
  const ownerFlag = isOwnerUser({ id: user.id, email: user.email ?? '', is_owner: (u as { is_owner?: boolean | null }).is_owner, role });
  if (!ownerFlag) {
    await requireInvoicingEnabled(u.company_id as string);
  }

  return { user, companyId: u.company_id as string, role, packageType, isOwner: ownerFlag };
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const FormItemSchema = IssuedInvoiceItemSchema.omit({
  id: true,
  invoice_id: true,
  position: true,
  net_amount: true,
  vat_amount: true,
  gross_amount: true,
});

const emptyToOpt = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());

const FormSchema = IssuedInvoiceSchema
  .omit({
    id: true, company_id: true, items: true, invoice_number: true,
    sale_date: true, due_date: true,
    buyer_nip: true, buyer_email: true,
    seller_bank_account: true, notes: true,
  })
  .extend({
    invoice_number: z.preprocess((v) => (v === '' || v === null ? undefined : v),
      z.string().min(1, 'Numer faktury jest wymagany').max(100).regex(/^[\w/\-. ]+$/, 'Numer faktury zawiera niedozwolone znaki').optional()),
    autoGenerateNumber: z.boolean().optional().default(true),
    buyer_company_id: z.string().uuid().nullable().optional(),
    sale_date: emptyToOpt(z.string().date('Nieprawidłowy format daty sprzedaży')),
    due_date: emptyToOpt(z.string().date('Nieprawidłowy format terminu płatności')),
    buyer_nip: emptyToOpt(z.string().regex(/^\d{10}$/, 'NIP musi składać się z 10 cyfr')),
    buyer_email: emptyToOpt(z.string().email('Nieprawidłowy adres e-mail')),
    seller_bank_account: emptyToOpt(z.string()),
    notes: emptyToOpt(z.string().max(2000)),
    items: z.array(FormItemSchema).min(1, 'Dodaj co najmniej jedną pozycję'),
  });

const OverrideAddressSchema = BillingAddressSchema;

const FormSchemaWithOverride = FormSchema.extend({
  overrideAddress: OverrideAddressSchema.nullable().optional(),
});

export type InvoiceFormValues = z.infer<typeof FormSchemaWithOverride>;

// ─── Compute & strip items ────────────────────────────────────────────────────

function buildItems(rawItems: InvoiceFormValues['items']) {
  return rawItems.map((item, i) => {
    const { net_amount, vat_amount, gross_amount } = computeItemAmounts(
      item.quantity,
      item.unit_price_net,
      item.vat_rate,
      item.discount_pct ?? null,
    );
    return {
      position:       i + 1,
      name:           item.name,
      unit:           item.unit ?? 'szt.',
      quantity:       item.quantity,
      unit_price_net: item.unit_price_net,
      vat_rate:       item.vat_rate,
      net_amount,
      vat_amount,
      gross_amount,
      discount_pct:   item.discount_pct ?? null,
    };
  });
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export async function createInvoice(
  values: InvoiceFormValues,
  intent: 'draft' | 'validate',
): Promise<ActionResult> {
  try {
    const { user, companyId, role, packageType, isOwner: ownerFlag } = await requireInvoicingUser();
    if (!canWriteInvoice(role, packageType)) return { ok: false, error: 'Brak uprawnień do tworzenia faktur.' };
    if (intent === 'validate' && !canIssueInvoice(role, packageType)) return { ok: false, error: 'Brak uprawnień do wystawiania faktur.' };

    const parsed = FormSchemaWithOverride.safeParse(values);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Nieprawidłowe dane formularza.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const data = parsed.data;
    const items = buildItems(data.items);
    const totals = computeInvoiceTotals(items);

    const isManual = data.autoGenerateNumber === false;
    const numberingMode = isManual ? 'manual' : 'automatic';

    const invoiceNumber = isManual && data.invoice_number
      ? data.invoice_number
      : `SZKIC-${Date.now()}`;

    const supabase = await getSupabaseServerClient();

    // Uniqueness check for manual invoice numbers
    if (data.autoGenerateNumber === false && data.invoice_number) {
      const { data: existing } = await supabase
        .from('issued_invoices')
        .select('id')
        .eq('company_id', companyId)
        .eq('invoice_number', data.invoice_number)
        .maybeSingle();
      if (existing) {
        return {
          ok: false,
          error: 'Faktura z tym numerem już istnieje.',
          fieldErrors: { invoice_number: ['Numer faktury musi być unikalny w ramach firmy'] },
        };
      }
    }

    // ── Resolve billing address snapshot from company settings or owner override ─
    let billingSnapshot: BillingAddress;
    let billingSource: 'company_settings' | 'override';

    if (data.overrideAddress && role === 'owner') {
      billingSnapshot = data.overrideAddress;
      billingSource = 'override';
    } else {
      const { data: companyRow } = await supabase
        .from('companies')
        .select('street, address_line2, city, zip, state_region, country, nip')
        .eq('id', companyId)
        .maybeSingle();

      billingSnapshot = companyAddressToBilling(companyRow as CompanyAddressRow);
      billingSource = 'company_settings';
    }

    const sellerAddressString = billingAddressToString(billingSnapshot);
    const nowIso = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invoice, error: insertErr } = await (supabase as any)
      .from('issued_invoices')
      .insert({
        company_id:          companyId,
        invoice_number:      invoiceNumber,
        numbering_mode:      numberingMode,
        status:              'draft',
        document_type:       data.document_type ?? 'STANDARD',
        corrected_invoice_number: data.corrected_invoice_number ?? null,
        corrected_invoice_date:   data.corrected_invoice_date ?? null,
        correction_reason:        data.correction_reason ?? null,
        advance_amount:      data.advance_amount ?? null,
        order_total_gross:   data.order_total_gross ?? null,
        remaining_amount:    data.remaining_amount ?? null,
        total_advances_amount: data.total_advances_amount ?? null,
        amount_due:          data.amount_due ?? null,
        currency:            data.currency ?? 'PLN',
        issue_date:          data.issue_date,
        sale_date:           data.sale_date ?? null,
        due_date:            data.due_date ?? null,
        payment_method:      data.payment_method ?? 'transfer',
        seller_name:         data.seller_name,
        seller_nip:          data.seller_nip,
        seller_address:      sellerAddressString,
        seller_bank_account: data.seller_bank_account ?? null,
        company_bank_account_id: data.company_bank_account_id ?? null,
        buyer_company_id:    data.buyer_company_id ?? null,
        buyer_name:          data.buyer_name,
        buyer_nip:           data.buyer_nip ?? null,
        buyer_address:       data.buyer_address ?? '',
        buyer_email:         data.buyer_email ?? null,
        net_total:           totals.net_total,
        vat_total:           totals.vat_total,
        gross_total:         totals.gross_total,
        notes:               data.notes ?? null,
        split_payment_mechanism: data.split_payment_mechanism ?? false,
        created_by:          user.id,
        updated_by:          user.id,
        billing_address_snapshot:     billingSnapshot as any,
        billing_address_source:       billingSource,
        billing_address_last_synced_at: nowIso,
      })
      .select('id')
      .single();

    if (insertErr || !invoice) {
      return { ok: false, error: insertErr?.message ?? 'Błąd zapisu faktury.' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: itemsErr } = await (supabase as any)
      .from('issued_invoice_items')
      .insert(items.map((it) => ({ ...it, invoice_id: invoice.id })));

    if (itemsErr) {
      return { ok: false, error: itemsErr.message };
    }

    // Audit: address snapshot created
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('invoice_audit').insert({
      invoice_id:  invoice.id,
      company_id:  companyId,
      actor_id:    user.id,
      actor_role:  role,
      event:       billingSource === 'override' ? 'address_override_used' : 'address_snapshot_created',
      source:      billingSource,
      after:       billingSnapshot as any,
    });

    const createdId = invoice.id as string;
    if (intent === 'validate') {
      const validation = await validateInvoiceRecord(
        { supabase, companyId, userId: user.id, role, ownerFlag },
        createdId,
      );
      revalidatePath('/admin/invoices');
      return validation;
    }

    revalidatePath('/admin/invoices');
    return { ok: true, id: createdId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export async function updateInvoice(
  id: string,
  values: InvoiceFormValues,
  intent: 'draft' | 'validate',
): Promise<ActionResult> {
  try {
    const { user, companyId, role, packageType, isOwner: ownerFlag } = await requireInvoicingUser();
    if (!canWriteInvoice(role, packageType)) return { ok: false, error: 'Brak uprawnień do edycji faktur.' };
    if (intent === 'validate' && !canIssueInvoice(role, packageType)) return { ok: false, error: 'Brak uprawnień do wystawiania faktur.' };

    const parsed = FormSchemaWithOverride.safeParse(values);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Nieprawidłowe dane formularza.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const data = parsed.data;
    const supabase = await getSupabaseServerClient();

    // Check invoice belongs to this company and is editable
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('issued_invoices')
      .select('id, status, invoice_number, numbering_mode, company_id')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!existing) return { ok: false, error: 'Faktura nie istnieje lub brak dostępu.' };
    if (!isEditable(existing.status)) {
      return { ok: false, error: 'Ta faktura została wysłana do KSeF i nie może być zmieniana. Wystaw fakturę korygującą.' };
    }

    const items = buildItems(data.items);
    const totals = computeInvoiceTotals(items);

    // ── Resolve billing address snapshot from company settings or owner override ─
    let billingSnapshot: BillingAddress;
    let billingSource: 'company_settings' | 'override';

    if (data.overrideAddress && role === 'owner') {
      billingSnapshot = data.overrideAddress;
      billingSource = 'override';
    } else {
      const { data: companyRow } = await supabase
        .from('companies')
        .select('street, address_line2, city, zip, state_region, country, nip')
        .eq('id', companyId)
        .maybeSingle();

      billingSnapshot = companyAddressToBilling(companyRow as CompanyAddressRow);
      billingSource = 'company_settings';
    }


    const sellerAddressString = billingAddressToString(billingSnapshot);
    const nowIso = new Date().toISOString();

    const isManual = data.autoGenerateNumber === false;
    const numberingMode = isManual ? 'manual' : 'automatic';

    const newNumber = isManual ? (data.invoice_number || existing.invoice_number) : existing.invoice_number;

    // Uniqueness check for manual invoice numbers (exclude current invoice)
    if (data.autoGenerateNumber === false && data.invoice_number && data.invoice_number !== existing.invoice_number) {
      const { data: dup } = await supabase
        .from('issued_invoices')
        .select('id')
        .eq('company_id', companyId)
        .eq('invoice_number', data.invoice_number)
        .neq('id', id)
        .maybeSingle();
      if (dup) {
        return {
          ok: false,
          error: 'Faktura z tym numerem już istnieje.',
          fieldErrors: { invoice_number: ['Numer faktury musi być unikalny w ramach firmy'] },
        };
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: updateErr } = await (supabase as any)
      .from('issued_invoices')
      .update({
        invoice_number:      newNumber,
        numbering_mode:      numberingMode,
        status:              'draft',
        updated_by:          user.id,
        document_type:       data.document_type ?? 'STANDARD',
        corrected_invoice_number: data.corrected_invoice_number ?? null,
        corrected_invoice_date:   data.corrected_invoice_date ?? null,
        correction_reason:        data.correction_reason ?? null,
        advance_amount:      data.advance_amount ?? null,
        order_total_gross:   data.order_total_gross ?? null,
        remaining_amount:    data.remaining_amount ?? null,
        total_advances_amount: data.total_advances_amount ?? null,
        amount_due:          data.amount_due ?? null,
        currency:            data.currency ?? 'PLN',
        issue_date:          data.issue_date,
        sale_date:           data.sale_date ?? null,
        due_date:            data.due_date ?? null,
        payment_method:      data.payment_method ?? 'transfer',
        seller_name:         data.seller_name,
        seller_nip:          data.seller_nip,
        seller_address:      sellerAddressString,
        seller_bank_account: data.seller_bank_account ?? null,
        company_bank_account_id: data.company_bank_account_id ?? null,
        buyer_company_id:    data.buyer_company_id ?? null,
        buyer_name:          data.buyer_name,
        buyer_nip:           data.buyer_nip ?? null,
        buyer_address:       data.buyer_address ?? '',
        buyer_email:         data.buyer_email ?? null,
        net_total:           totals.net_total,
        vat_total:           totals.vat_total,
        gross_total:         totals.gross_total,
        notes:               data.notes ?? null,
        split_payment_mechanism: data.split_payment_mechanism ?? false,
        billing_address_snapshot:     billingSnapshot as any,
        billing_address_source:       billingSource,
        billing_address_last_synced_at: nowIso,
        updated_at:          new Date().toISOString(),
      })
      .eq('id', id)
      .in('status', EDITABLE_INVOICE_STATUSES)
      .select('id')
      .maybeSingle();

    if (updateErr) return { ok: false, error: updateErr.message };
    if (!updated) return { ok: false, error: 'Faktura została właśnie wysłana lub zmieniona. Odśwież stronę.' };

    // Replace all items atomically: delete old, insert new
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('issued_invoice_items')
      .delete()
      .eq('invoice_id', id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: itemsErr } = await (supabase as any)
      .from('issued_invoice_items')
      .insert(items.map((it) => ({ ...it, invoice_id: id })));

    if (itemsErr) return { ok: false, error: itemsErr.message };

    // Audit: address snapshot created/refreshed on update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('invoice_audit').insert({
      invoice_id:  id,
      company_id:  companyId,
      actor_id:    user.id,
      actor_role:  role,
      event:       billingSource === 'override' ? 'address_override_used' : 'address_snapshot_refreshed',
      source:      billingSource,
      after:       billingSnapshot as any,
    });

    if (intent === 'validate') {
      const validation = await validateInvoiceRecord(
        { supabase, companyId, userId: user.id, role, ownerFlag },
        id,
      );
      revalidatePath('/admin/invoices');
      revalidatePath(`/admin/invoices/${id}`);
      return validation;
    }

    revalidatePath('/admin/invoices');
    revalidatePath(`/admin/invoices/${id}`);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── Validate & delete draft ──────────────────────────────────────────────────

type InvoiceContext = {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  companyId: string;
  userId: string;
  role: AppRole;
  ownerFlag: boolean;
};

/**
 * Checks a draft against the submission rules and, when it passes, marks it
 * ready for KSeF. Assigns the official number for automatic numbering and
 * consumes a monthly invoice slot the first time the invoice becomes ready.
 */
async function validateInvoiceRecord(ctx: InvoiceContext, id: string): Promise<ActionResult> {
  const { supabase, companyId, userId, role, ownerFlag } = ctx;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: invoice } = await db
    .from('issued_invoices')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!invoice) return { ok: false, error: 'Faktura nie istnieje lub brak dostępu.' };
  if (invoice.status === 'ready_for_ksef') return { ok: true, id };
  if (!isEditable(invoice.status)) {
    return { ok: false, id, error: 'Ta faktura została już wysłana do KSeF i nie może być walidowana. Wystaw fakturę korygującą.' };
  }

  const { data: items } = await db
    .from('issued_invoice_items')
    .select('name, quantity, unit_price_net, vat_rate')
    .eq('invoice_id', id)
    .order('position', { ascending: true });

  const issues = findSubmissionIssues(invoice, items ?? []);
  if (issues.length > 0) {
    return {
      ok: false,
      id,
      error: 'Faktura nie może zostać wysłana do KSeF. Uzupełnij brakujące dane.',
      issues,
    };
  }

  // Legacy 'issued' rows already consumed a monthly slot when they were issued
  const alreadyCounted = invoice.status === 'issued';
  if (!alreadyCounted) {
    const limitCheck = await checkInvoiceLimit(companyId, { userId, isOwner: ownerFlag });
    if (!limitCheck.allowed) {
      return { ok: false, id, error: limitCheck.reason ?? 'Osiągnięto miesięczny limit faktur.' };
    }
  }

  const needsNumber = invoice.numbering_mode !== 'manual'
    && (!invoice.invoice_number || String(invoice.invoice_number).startsWith('SZKIC-'));
  const invoiceNumber = needsNumber ? await generateInvoiceNumber(companyId) : invoice.invoice_number;

  const { data: updated, error: updateErr } = await db
    .from('issued_invoices')
    .update({
      status:         'ready_for_ksef',
      invoice_number: invoiceNumber,
      updated_by:     userId,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', invoice.status)
    .select('id')
    .maybeSingle();

  if (updateErr) return { ok: false, id, error: updateErr.message };
  if (!updated) return { ok: false, id, error: 'Faktura została właśnie zmieniona. Odśwież stronę i spróbuj ponownie.' };

  if (!alreadyCounted) await consumeOverride(companyId);

  await db.from('invoice_audit').insert({
    invoice_id: id,
    company_id: companyId,
    actor_id:   userId,
    actor_role: role,
    event:      'validated_ready_for_ksef',
    source:     'validation',
    after:      { invoice_number: invoiceNumber },
  });

  return { ok: true, id };
}

export async function validateInvoice(id: string): Promise<ActionResult> {
  try {
    const { user, companyId, role, packageType, isOwner: ownerFlag } = await requireInvoicingUser();
    if (!canIssueInvoice(role, packageType)) return { ok: false, error: 'Brak uprawnień do wystawiania faktur.' };

    const supabase = await getSupabaseServerClient();
    const result = await validateInvoiceRecord({ supabase, companyId, userId: user.id, role, ownerFlag }, id);
    revalidatePath('/admin/invoices');
    revalidatePath(`/admin/invoices/${id}`);
    return result;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

export async function deleteDraft(id: string): Promise<ActionResult> {
  try {
    const { companyId, role, packageType } = await requireInvoicingUser();
    if (!canWriteInvoice(role, packageType)) return { ok: false, error: 'Brak uprawnień do usuwania faktur.' };

    const supabase = await getSupabaseServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    const { data: existing } = await db
      .from('issued_invoices')
      .select('id, status')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!existing) return { ok: false, error: 'Faktura nie istnieje lub brak dostępu.' };
    if (!isDeletable(existing.status)) return { ok: false, error: 'Usunąć można tylko szkic faktury.' };

    const { data: deleted, error } = await db
      .from('issued_invoices')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!deleted) return { ok: false, error: 'Nie masz uprawnień do usunięcia tego szkicu.' };

    revalidatePath('/admin/invoices');
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── Redirect helpers ─────────────────────────────────────────────────────────

export async function redirectToInvoice(id: string) {
  redirect(`/admin/invoices/${id}`);
}

// ─── KSeF helpers ─────────────────────────────────────────────────────────────

export type KsefActionResult =
  | { ok: true;  id: string; rawXml: string; signedXml: string; isMock: boolean; referenceNo: string | null }
  | { ok: false; error: string };

// ─── sendToKsef ───────────────────────────────────────────────────────────────

/**
 * Build the signed FA(2) XML for an invoice and submit it to KSeF.
 *
 * Without credentials the payload is returned but NOT sent; the invoice stays
 * as `issued`. With credentials the invoice transitions to `sent_to_ksef` and
 * the KSeF reference number is stored.
 */
export async function sendToKsef(invoiceId: string): Promise<KsefActionResult> {
  try {
    const { user, companyId, role, packageType } = await requireInvoicingUser();
    if (!canSendToKsefRole(role, packageType)) return { ok: false, error: 'Brak uprawnień do wysyłania faktur do KSeF.' };

    const supabase = await getSupabaseServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inv } = await (supabase as any)
      .from('issued_invoices')
      .select('id, status, company_id, ksef_reference_no, seller_nip')
      .eq('id', invoiceId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!inv) return { ok: false, error: 'Faktura nie istnieje lub brak dostępu.' };
    if (inv.status === 'sent_to_ksef') return { ok: false, error: 'Faktura jest już wysłana do KSeF.' };
    if (inv.status === 'accepted') return { ok: false, error: 'Faktura jest już zaakceptowana przez KSeF.' };
    if (inv.status === 'cancelled') return { ok: false, error: 'Nie można wysłać anulowanej faktury.' };
    if (inv.status === 'rejected') return { ok: false, error: 'Faktura została odrzucona przez KSeF. Wystaw fakturę korygującą.' };
    if (!isSubmittable(inv.status)) {
      return { ok: false, error: 'Najpierw zwaliduj fakturę. Tylko zwalidowana faktura może zostać wysłana do KSeF.' };
    }

    // Build + sign FA(2) XML
    const payload = await buildKsefPayload(invoiceId);

    // Load KSeF credentials
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: creds } = await (supabase as any)
      .from('ksef_credentials')
      .select('token, environment')
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!creds?.token) {
      // No credentials — return the payload without sending
      return {
        ok:         true,
        id:         invoiceId,
        rawXml:     payload.rawXml,
        signedXml:  payload.signedXml,
        isMock:     payload.signing.isMock,
        referenceNo: null,
      };
    }

    // Get company NIP for KSeF auth
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: company } = await (supabase as any)
      .from('companies')
      .select('nip')
      .eq('id', companyId)
      .maybeSingle();

    if (!company?.nip) {
      return { ok: false, error: 'Firma nie ma numeru NIP — wymagany do KSeF.' };
    }

    const idempotencyKey = generateIdempotencyKey(invoiceId);

    // Submit using the proper KSeF 2.0 session-based flow
    const result = await submitToKsef({
      invoiceId,
      signedXml: payload.signedXml,
      idempotencyKey,
      credentials: { token: creds.token, environment: creds.environment as 'test' | 'prod' },
      companyNip: company.nip,
      existingKsefNumber: inv.ksef_reference_no ?? null,
    });

    const nowIso = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('issued_invoices')
      .update({
        status:             result.status === 'accepted' ? 'accepted' : 'sent_to_ksef',
        ksef_status:        result.status,
        ksef_sent_at:       nowIso,
        submitted_to_ksef_at: nowIso,
        updated_by:         user.id,
        ksef_reference_no:  result.ksefNumber ?? inv.ksef_reference_no ?? null,
        ksef_error_message: result.error ?? null,
        updated_at:         nowIso,
      })
      .eq('id', invoiceId);

    revalidatePath('/admin/invoices');
    revalidatePath(`/admin/invoices/${invoiceId}`);

    if (!result.success && !result.transient) {
      return { ok: false, error: result.error ?? 'KSeF odrzucił fakturę.' };
    }

    return {
      ok:         true,
      id:         invoiceId,
      rawXml:     payload.rawXml,
      signedXml:  payload.signedXml,
      isMock:     payload.signing.isMock,
      referenceNo: result.ksefNumber ?? null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── checkKsefStatus ──────────────────────────────────────────────────────────

export type KsefStatusResult =
  | { ok: true;  status: string; referenceNo: string | null; acceptedAt: string | null }
  | { ok: false; error: string };

/**
 * Poll KSeF for the current processing status of an already-sent invoice.
 *
 * KSeF v2 endpoint: GET /invoices/send/{referenceNumber}
 * Returns status code: 100 = processing, 200 = accepted, 400 = rejected.
 *
 * Without credentials the function returns the status stored in our DB.
 */
export async function checkKsefStatus(invoiceId: string): Promise<KsefStatusResult> {
  try {
    const { companyId } = await requireInvoicingUser();
    const supabase = await getSupabaseServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inv } = await (supabase as any)
      .from('issued_invoices')
      .select('id, status, company_id, ksef_reference_no, ksef_status, ksef_accepted_at, ksef_submission_id')
      .eq('id', invoiceId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!inv) return { ok: false, error: 'Faktura nie istnieje lub brak dostępu.' };
    if (!inv.ksef_reference_no && !inv.ksef_submission_id) {
      return { ok: false, error: 'Brak numeru referencyjnego KSeF — faktura nie była jeszcze wysłana.' };
    }

    // Load credentials
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: creds } = await (supabase as any)
      .from('ksef_credentials')
      .select('token, environment')
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!creds?.token) {
      return {
        ok:          true,
        status:      inv.ksef_status ?? 'pending',
        referenceNo: inv.ksef_reference_no,
        acceptedAt:  inv.ksef_accepted_at ?? null,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: company } = await (supabase as any)
      .from('companies')
      .select('nip')
      .eq('id', companyId)
      .maybeSingle();

    if (!company?.nip) {
      return { ok: false, error: 'Firma nie ma numeru NIP.' };
    }

    const submissionId = inv.ksef_submission_id ?? inv.ksef_reference_no;
    const result = await pollKsefStatus({
      submissionId,
      credentials: { token: creds.token, environment: creds.environment as 'test' | 'prod' },
      companyNip: company.nip,
    });

    let newKsefStatus: string = inv.ksef_status ?? 'pending';
    let newInvoiceStatus: string = inv.status;
    let acceptedAt: string | null = inv.ksef_accepted_at ?? null;
    let errorMessage: string | null = null;

    if (result.status === 'accepted' && result.ksefNumber) {
      newKsefStatus    = 'accepted';
      newInvoiceStatus = 'accepted';
      acceptedAt       = new Date().toISOString();
    } else if (result.status === 'rejected') {
      newKsefStatus    = 'rejected';
      newInvoiceStatus = 'rejected';
      errorMessage     = result.error ?? 'Odrzucono przez KSeF';
    } else {
      newKsefStatus = result.status;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('issued_invoices')
      .update({
        ksef_status:        newKsefStatus,
        status:             newInvoiceStatus,
        ksef_accepted_at:   acceptedAt,
        ksef_error_message: errorMessage,
        updated_at:         new Date().toISOString(),
      })
      .eq('id', invoiceId);

    revalidatePath('/admin/invoices');
    revalidatePath(`/admin/invoices/${invoiceId}`);

    return {
      ok:          true,
      status:      newKsefStatus,
      referenceNo: inv.ksef_reference_no,
      acceptedAt,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}