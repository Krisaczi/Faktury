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
  type IssuedInvoiceInput,
} from '@/types/issued-invoice';
import { buildKsefPayload } from '@/lib/ksef';
import {
  canAccessInvoicing,
  canWriteInvoice,
  canIssueInvoice,
  canSendToKsef as canSendToKsefRole,
  type AppRole,
} from '@/lib/permissions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive action-level server result (never throws on validation errors) */
export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Fetch the current user with their role and company. Throws on auth failure. */
async function requireInvoicingUser() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: u } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) throw new Error('No company');
  const role = (u.role ?? 'member') as AppRole;
  if (!canAccessInvoicing(role)) throw new Error('Brak dostępu do modułu fakturowania.');
  return { user, companyId: u.company_id as string, role };
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const FormItemSchema = IssuedInvoiceItemSchema.omit({
  id: true,
  invoice_id: true,
  net_amount: true,
  vat_amount: true,
  gross_amount: true,
});

const FormSchema = IssuedInvoiceSchema
  .omit({ id: true, company_id: true, items: true })
  .extend({
    items: z.array(FormItemSchema).min(1, 'Dodaj co najmniej jedną pozycję'),
  });

export type InvoiceFormValues = z.infer<typeof FormSchema>;

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
  intent: 'draft' | 'issue',
): Promise<ActionResult> {
  try {
    const { user, companyId, role } = await requireInvoicingUser();
    if (!canWriteInvoice(role)) return { ok: false, error: 'Brak uprawnień do tworzenia faktur.' };
    if (intent === 'issue' && !canIssueInvoice(role)) return { ok: false, error: 'Brak uprawnień do wystawiania faktur.' };

    const parsed = FormSchema.safeParse(values);
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

    const invoiceNumber =
      intent === 'issue'
        ? await generateInvoiceNumber(companyId)
        : (data.invoice_number || `SZKIC-${Date.now()}`);

    const supabase = await getSupabaseServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invoice, error: insertErr } = await (supabase as any)
      .from('issued_invoices')
      .insert({
        company_id:          companyId,
        invoice_number:      invoiceNumber,
        status:              intent === 'issue' ? 'issued' : 'draft',
        currency:            data.currency ?? 'PLN',
        issue_date:          data.issue_date,
        sale_date:           data.sale_date ?? null,
        due_date:            data.due_date ?? null,
        payment_method:      data.payment_method ?? 'transfer',
        seller_name:         data.seller_name,
        seller_nip:          data.seller_nip,
        seller_address:      data.seller_address,
        seller_bank_account: data.seller_bank_account ?? null,
        buyer_name:          data.buyer_name,
        buyer_nip:           data.buyer_nip ?? null,
        buyer_address:       data.buyer_address ?? '',
        buyer_email:         data.buyer_email ?? null,
        net_total:           totals.net_total,
        vat_total:           totals.vat_total,
        gross_total:         totals.gross_total,
        notes:               data.notes ?? null,
        created_by:          user.id,
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

    revalidatePath('/admin/invoices');
    return { ok: true, id: invoice.id as string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export async function updateInvoice(
  id: string,
  values: InvoiceFormValues,
  intent: 'draft' | 'issue',
): Promise<ActionResult> {
  try {
    const { companyId, role } = await requireInvoicingUser();
    if (!canWriteInvoice(role)) return { ok: false, error: 'Brak uprawnień do edycji faktur.' };
    if (intent === 'issue' && !canIssueInvoice(role)) return { ok: false, error: 'Brak uprawnień do wystawiania faktur.' };

    const parsed = FormSchema.safeParse(values);
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
      .select('id, status, invoice_number, company_id')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!existing) return { ok: false, error: 'Faktura nie istnieje lub brak dostępu.' };
    if (existing.status !== 'draft') {
      return { ok: false, error: 'Tylko faktury w stanie "Szkic" mogą być edytowane.' };
    }

    const items = buildItems(data.items);
    const totals = computeInvoiceTotals(items);

    const newNumber =
      intent === 'issue' && existing.status === 'draft'
        ? await generateInvoiceNumber(companyId)
        : existing.invoice_number;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase as any)
      .from('issued_invoices')
      .update({
        invoice_number:      newNumber,
        status:              intent === 'issue' ? 'issued' : 'draft',
        currency:            data.currency ?? 'PLN',
        issue_date:          data.issue_date,
        sale_date:           data.sale_date ?? null,
        due_date:            data.due_date ?? null,
        payment_method:      data.payment_method ?? 'transfer',
        seller_name:         data.seller_name,
        seller_nip:          data.seller_nip,
        seller_address:      data.seller_address,
        seller_bank_account: data.seller_bank_account ?? null,
        buyer_name:          data.buyer_name,
        buyer_nip:           data.buyer_nip ?? null,
        buyer_address:       data.buyer_address ?? '',
        buyer_email:         data.buyer_email ?? null,
        net_total:           totals.net_total,
        vat_total:           totals.vat_total,
        gross_total:         totals.gross_total,
        notes:               data.notes ?? null,
        updated_at:          new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) return { ok: false, error: updateErr.message };

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

    revalidatePath('/admin/invoices');
    revalidatePath(`/admin/invoices/${id}`);
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

const KSEF_TEST_URL = 'https://api-test.ksef.mf.gov.pl/v2';
const KSEF_PROD_URL = 'https://api.ksef.mf.gov.pl/v2';

export type KsefActionResult =
  | { ok: true;  id: string; rawXml: string; signedXml: string; isMock: boolean; referenceNo: string | null }
  | { ok: false; error: string };

async function getKsefCreds(companyId: string) {
  const supabase = await getSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: creds } = await (supabase as any)
    .from('ksef_credentials')
    .select('token, environment')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    token:   creds?.token   as string | null,
    baseUrl: creds?.environment === 'prod' ? KSEF_PROD_URL : KSEF_TEST_URL,
  };
}

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
    const { companyId, role } = await requireInvoicingUser();
    if (!canSendToKsefRole(role)) return { ok: false, error: 'Brak uprawnień do wysyłania faktur do KSeF.' };

    const supabase = await getSupabaseServerClient();

    // Guard: only issued invoices may be sent
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inv } = await (supabase as any)
      .from('issued_invoices')
      .select('id, status, company_id')
      .eq('id', invoiceId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!inv) return { ok: false, error: 'Faktura nie istnieje lub brak dostępu.' };
    if (inv.status === 'draft') return { ok: false, error: 'Wystaw fakturę przed wysłaniem do KSeF.' };
    if (inv.status === 'sent_to_ksef') return { ok: false, error: 'Faktura jest już wysłana do KSeF.' };
    if (inv.status === 'accepted') return { ok: false, error: 'Faktura jest już zaakceptowana przez KSeF.' };
    if (inv.status === 'cancelled') return { ok: false, error: 'Nie można wysłać anulowanej faktury.' };

    // Build + sign FA(2) XML
    const payload = await buildKsefPayload(invoiceId);
    const { token, baseUrl } = await getKsefCreds(companyId);

    let referenceNo: string | null = null;

    if (token) {
      const res = await fetch(`${baseUrl}/invoices/send`, {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
          Accept:         'application/json',
        },
        body: Buffer.from(payload.signedXml, 'utf-8'),
      });

      if (!res.ok) {
        const detail = (await res.text()).slice(0, 500);
        const errMsg = `KSeF (${res.status}): ${detail}`;

        // Persist error into the invoice record
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('issued_invoices')
          .update({
            ksef_error_message: errMsg,
            updated_at:         new Date().toISOString(),
          })
          .eq('id', invoiceId);

        revalidatePath(`/admin/invoices/${invoiceId}`);
        return { ok: false, error: errMsg };
      }

      const body   = await res.json();
      referenceNo  = body.referenceNumber ?? body.ksefReferenceNumber ?? null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('issued_invoices')
        .update({
          status:             'sent_to_ksef',
          ksef_status:        'pending',
          ksef_sent_at:       new Date().toISOString(),
          ksef_reference_no:  referenceNo,
          ksef_error_message: null,
          updated_at:         new Date().toISOString(),
        })
        .eq('id', invoiceId);
    }

    revalidatePath('/admin/invoices');
    revalidatePath(`/admin/invoices/${invoiceId}`);

    return {
      ok:         true,
      id:         invoiceId,
      rawXml:     payload.rawXml,
      signedXml:  payload.signedXml,
      isMock:     payload.signing.isMock,
      referenceNo,
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
      .select('id, status, company_id, ksef_reference_no, ksef_status, ksef_accepted_at')
      .eq('id', invoiceId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!inv) return { ok: false, error: 'Faktura nie istnieje lub brak dostępu.' };
    if (!inv.ksef_reference_no) {
      return { ok: false, error: 'Brak numeru referencyjnego KSeF — faktura nie była jeszcze wysłana.' };
    }

    const { token, baseUrl } = await getKsefCreds(companyId);

    if (!token) {
      // No credentials — return what we have in DB
      return {
        ok:         true,
        status:     inv.ksef_status ?? 'pending',
        referenceNo: inv.ksef_reference_no,
        acceptedAt: inv.ksef_accepted_at ?? null,
      };
    }

    const res = await fetch(
      `${baseUrl}/invoices/send/${encodeURIComponent(inv.ksef_reference_no)}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    );

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      return { ok: false, error: `KSeF status check failed (${res.status}): ${detail}` };
    }

    const data       = await res.json();
    const statusCode: number = data.processingCode ?? data.status?.code ?? 0;

    let newKsefStatus: string;
    let newInvoiceStatus: string = inv.status;
    let acceptedAt: string | null = inv.ksef_accepted_at ?? null;
    let errorMessage: string | null = null;

    if (statusCode === 200) {
      newKsefStatus    = 'accepted';
      newInvoiceStatus = 'accepted';
      acceptedAt       = new Date().toISOString();
    } else if (statusCode === 400 || statusCode >= 300) {
      newKsefStatus    = 'rejected';
      newInvoiceStatus = 'rejected';
      errorMessage     = data.status?.description ?? data.errorDescription ?? `Odrzucono (kod ${statusCode})`;
    } else {
      // 100 = still processing
      newKsefStatus = 'processing';
    }

    // Persist updated status
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