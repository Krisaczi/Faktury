/**
 * KSeF service — public entry point.
 *
 * Usage:
 *   const payload = await buildKsefPayload(invoiceId);
 *   // payload.rawXml     — FA(2) XML, unsigned
 *   // payload.signedXml  — FA(2) XML with embedded XAdES-BES <Signature>
 *   // payload.isMock     — true in dev/test (no real cert configured)
 *
 * To send to KSeF after building the payload:
 *   POST https://api(-test).ksef.mf.gov.pl/v2/invoices/send
 *   Authorization: Bearer <accessToken>
 *   Content-Type: application/octet-stream
 *   Body: Buffer.from(payload.signedXml, 'utf-8')
 */

import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { IssuedInvoiceWithItems } from '@/types/issued-invoice';
import { buildFa2Xml } from './xml-builder';
import { signInvoiceXml, type SignedPayload } from './signer';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface KsefPayload {
  /** Invoice UUID from our DB. */
  invoiceId:    string;
  /** Invoice number (human-readable). */
  invoiceNumber: string;
  /** Raw (unsigned) FA(2) XML. */
  rawXml:       string;
  /** FA(2) XML with embedded XAdES-BES signature element. */
  signedXml:    string;
  /** Signature metadata. */
  signing:      Pick<SignedPayload, 'signatureValue' | 'signingTime' | 'certFingerprint' | 'isMock'>;
}

// ─── DB fetch ──────────────────────────────────────────────────────────────────

async function fetchInvoiceWithItems(id: string): Promise<IssuedInvoiceWithItems> {
  const supabase = await getSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice, error } = await (supabase as any)
    .from('issued_invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error)   throw new Error(`DB error fetching invoice: ${error.message}`);
  if (!invoice) throw new Error(`Invoice ${id} not found`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items, error: itemsErr } = await (supabase as any)
    .from('issued_invoice_items')
    .select('*')
    .eq('invoice_id', id)
    .order('position', { ascending: true });

  if (itemsErr) throw new Error(`DB error fetching invoice items: ${itemsErr.message}`);

  return { ...invoice, items: items ?? [] };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a complete KSeF payload for an issued invoice.
 *
 * @param invoiceId  UUID of the invoice in the `issued_invoices` table.
 * @returns          KsefPayload containing raw XML, signed XML, and signing metadata.
 * @throws           Error if the invoice does not exist or is not in a submittable status.
 */
export async function buildKsefPayload(invoiceId: string): Promise<KsefPayload> {
  const invoice = await fetchInvoiceWithItems(invoiceId);

  if (invoice.items.length === 0) {
    throw new Error('Cannot build KSeF payload: invoice has no line items');
  }

  if (invoice.status === 'draft') {
    throw new Error('Cannot build KSeF payload: invoice is still a draft — issue it first');
  }

  const rawXml  = buildFa2Xml(invoice);
  const signed  = signInvoiceXml(rawXml);

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

// ─── Re-exports ────────────────────────────────────────────────────────────────

export { buildFa2Xml }          from './xml-builder';
export { signInvoiceXml,
         signXml,
         signXmlMock,
         loadSigningCredentials } from './signer';
export type { SigningCredentials, SignedPayload } from './signer';
