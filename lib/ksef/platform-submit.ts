/**
 * KSeF payload builder for platform invoices.
 *
 * Platform invoices live in `platform_invoices` + `platform_invoice_line_items`
 * and have a different schema from user-issued invoices (`issued_invoices`).
 * This module maps platform invoice data into the `IssuedInvoiceWithItems`
 * shape that the FA(2) XML builder expects.
 */

import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { IssuedInvoiceWithItems } from '@/types/issued-invoice';
import { buildFa2Xml } from './xml-builder';
import { signInvoiceXml, type SignedPayload } from './signer';
import type { KsefPayload } from './index';

/**
 * Map a numeric VAT rate percent to the VatRate enum.
 * KSeF FA(2) only supports specific rates: 23, 8, 5, 0, zw, np, oo.
 */
function vatRateFromPercent(percent: number | string | null): string {
  if (percent == null) return '0';
  const n = typeof percent === 'string' ? Number(percent) : percent;
  if (n === 23) return '23';
  if (n === 8)  return '8';
  if (n === 5)  return '5';
  if (n === 0)  return '0';
  // Unknown rates default to 0 — KSeF only supports standard rates
  return '0';
}

/**
 * Fetch a platform invoice with its line items and company data,
 * mapped to the IssuedInvoiceWithItems shape for the XML builder.
 */
async function fetchPlatformInvoiceForKsef(invoiceId: string): Promise<IssuedInvoiceWithItems> {
  const supabase = await getSupabaseServerClient();

  // Fetch the platform invoice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice, error: invError } = await (supabase as any)
    .from('platform_invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();

  if (invError) throw new Error(`DB error fetching platform invoice: ${invError.message}`);
  if (!invoice) throw new Error(`Platform invoice ${invoiceId} not found`);

  // Fetch line items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items, error: itemsError } = await (supabase as any)
    .from('platform_invoice_line_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: true });

  if (itemsError) throw new Error(`DB error fetching platform invoice items: ${itemsError.message}`);
  if (!items || items.length === 0) throw new Error('Cannot build KSeF payload: invoice has no line items');

  // Fetch the buyer company (entity_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: buyerCompany, error: buyerError } = await (supabase as any)
    .from('companies')
    .select('id, name, nip, street, zip, city')
    .eq('id', invoice.entity_id)
    .maybeSingle();

  if (buyerError) throw new Error(`DB error fetching buyer company: ${buyerError.message}`);

  // Fetch the platform owner company (the seller).
  // The seller is the company associated with the owner who issued the invoice.
  // For platform usage invoices, the seller is the platform itself.
  // We look up the owner's company via the issued_by field.
  let sellerName = 'Bezpieczne Faktury';
  let sellerNip  = '0000000000'; // Platform NIP — should be configured
  let sellerAddress = 'ul. Przykładowa 1, 00-001 Warszawa';

  if (invoice.issued_by) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: issuer } = await (supabase as any)
      .from('users')
      .select('company_id')
      .eq('id', invoice.issued_by)
      .maybeSingle();

    if (issuer?.company_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sellerCompany } = await (supabase as any)
        .from('companies')
        .select('name, nip, street, zip, city')
        .eq('id', issuer.company_id)
        .maybeSingle();

      if (sellerCompany) {
        sellerName = sellerCompany.name ?? sellerName;
        sellerNip = sellerCompany.nip ?? sellerNip;
        const street = sellerCompany.street ?? '';
        const zip = sellerCompany.zip ?? '';
        const city = sellerCompany.city ?? '';
        sellerAddress = `${street}, ${zip} ${city}`.replace(/^,\s*/, '').trim() || sellerAddress;
      }
    }
  }

  // Build the buyer address
  const buyerStreet = buyerCompany?.street ?? '';
  const buyerZip = buyerCompany?.zip ?? '';
  const buyerCity = buyerCompany?.city ?? '';
  const buyerAddress = `${buyerStreet}, ${buyerZip} ${buyerCity}`.replace(/^,\s*/, '').trim();

  // Determine the invoice-level VAT rate
  const invoiceVatRate = vatRateFromPercent(invoice.vat_rate_percent);

  // Map line items to the issued_invoice_items shape
  const mappedItems = items.map((item: {
    id: string;
    description: string;
    quantity: string | number;
    unit_price_cents: number;
    amount_cents: number;
    taxable: boolean;
    vat_rate_percent: string | number | null;
  }, index: number) => {
    const itemVatRate = item.vat_rate_percent != null
      ? vatRateFromPercent(item.vat_rate_percent)
      : invoiceVatRate;

    const unitPriceNet = item.unit_price_cents / 100;
    const netAmount = item.amount_cents / 100;
    const vatMultiplier = Number(itemVatRate) / 100;
    const vatAmount = netAmount * vatMultiplier;
    const grossAmount = netAmount + vatAmount;

    return {
      id: item.id,
      invoice_id: invoiceId,
      position: index + 1,
      name: item.description,
      unit: 'szt.',
      quantity: Number(item.quantity),
      unit_price_net: unitPriceNet,
      vat_rate: itemVatRate,
      net_amount: netAmount,
      vat_amount: vatAmount,
      gross_amount: grossAmount,
      discount_pct: null,
    };
  });

  // Calculate totals from line items
  const netTotal = mappedItems.reduce((sum: number, i: { net_amount: number }) => sum + i.net_amount, 0);
  const vatTotal = mappedItems.reduce((sum: number, i: { vat_amount: number }) => sum + i.vat_amount, 0);
  const grossTotal = netTotal + vatTotal;

  // Map to the IssuedInvoiceWithItems shape.
  // Platform invoices have a different schema, so we use a type assertion
  // after building only the fields the XML builder actually reads.
  const mappedInvoice = {
    id: invoiceId,
    company_id: invoice.entity_id,
    invoice_number: invoice.invoice_number,
    status: invoice.status === 'draft' ? 'draft' : 'issued',
    currency: invoice.currency ?? 'PLN',
    issue_date: invoice.invoice_date ?? (invoice.issued_at ? invoice.issued_at.split('T')[0] : new Date().toISOString().split('T')[0]),
    sale_date: null,
    due_date: invoice.due_date ?? null,
    payment_method: 'transfer',
    seller_name: sellerName,
    seller_nip: sellerNip,
    seller_address: sellerAddress,
    seller_bank_account: null,
    buyer_name: buyerCompany?.name ?? 'Klient',
    buyer_nip: buyerCompany?.nip ?? null,
    buyer_address: buyerAddress,
    buyer_email: null,
    net_total: netTotal,
    vat_total: vatTotal,
    gross_total: grossTotal,
    notes: invoice.notes ?? null,
    ksef_reference_no: invoice.ksef_number ?? null,
    ksef_session_token: null,
    ksef_status: null,
    ksef_error_message: null,
    ksef_sent_at: null,
    ksef_accepted_at: null,
    created_by: invoice.issued_by ?? null,
    created_at: invoice.created_at,
    updated_at: invoice.updated_at,
    company_bank_account: null,
    items: mappedItems,
  } as unknown as IssuedInvoiceWithItems;

  return mappedInvoice;
}

/**
 * Build a KSeF payload for a platform invoice.
 *
 * This is the platform invoice equivalent of buildKsefPayload().
 * It fetches from platform_invoices + platform_invoice_line_items,
 * maps to the IssuedInvoiceWithItems shape, and builds + signs the FA(2) XML.
 */
export async function buildPlatformKsefPayload(invoiceId: string): Promise<KsefPayload> {
  const invoice = await fetchPlatformInvoiceForKsef(invoiceId);

  if (invoice.status === 'draft') {
    throw new Error('Cannot build KSeF payload: invoice is still a draft — issue it first');
  }

  const rawXml = buildFa2Xml(invoice);
  const signed: SignedPayload = signInvoiceXml(rawXml);

  return {
    invoiceId,
    invoiceNumber: invoice.invoice_number,
    rawXml,
    signedXml: signed.signedXml,
    signing: {
      signatureValue:  signed.signatureValue,
      signingTime:     signed.signingTime,
      certFingerprint: signed.certFingerprint,
      isMock:          signed.isMock,
    },
  };
}
