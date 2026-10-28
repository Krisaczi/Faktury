/**
 * KSeF service — public entry point.
 *
 * Usage:
 *   const payload = await buildKsefPayload(invoiceId);
 *   // payload.rawXml     — FA(3) XML, unsigned
 *   // payload.signedXml  — FA(3) XML with embedded XAdES-BES <Signature>
 *   // payload.isMock     — true in dev/test (no real cert configured)
 *
 * Pre-submission validation gate:
 *   Before signing and returning the payload, the XML is validated against
 *   the FA(3) schema and business rules. If validation fails, an error is
 *   thrown with the validation report, BLOCKING submission to KSeF.
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
import { validateFa3Xml } from './xml-validator';
import { generateValidationReport, type PreSubmissionReport } from './validation-report';
import { signInvoiceXml, type SignedPayload } from './signer';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface KsefPayload {
  /** Invoice UUID from our DB. */
  invoiceId:    string;
  /** Invoice number (human-readable). */
  invoiceNumber: string;
  /** Raw (unsigned) FA(3) XML. */
  rawXml:       string;
  /** FA(3) XML with embedded XAdES-BES signature element. */
  signedXml:    string;
  /** Signature metadata. */
  signing:      Pick<SignedPayload, 'signatureValue' | 'signingTime' | 'certFingerprint' | 'isMock'>;
  /** Pre-submission validation report (always present when payload is built). */
  validationReport: PreSubmissionReport;
}

/**
 * Error thrown when pre-submission validation fails, blocking KSeF submission.
 */
export class KsefValidationBlockError extends Error {
  readonly report: PreSubmissionReport;

  constructor(report: PreSubmissionReport) {
    const errorCount = report.xmlValidation.errors.length;
    const errorSummary = report.xmlValidation.errors
      .slice(0, 5)
      .map(e => `[${e.rule}] ${e.message}`)
      .join('; ');
    super(`KSeF submission blocked: ${errorCount} validation error(s). ${errorSummary}`);
    this.name = 'KsefValidationBlockError';
    this.report = report;
  }
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
 * Pre-submission validation is performed automatically. If the generated XML
 * fails schema or business rule validation, a KsefValidationBlockError is thrown
 * containing the full validation report. The caller should catch this and
 * present the diagnostics to the user.
 *
 * @param invoiceId  UUID of the invoice in the `issued_invoices` table.
 * @returns          KsefPayload containing raw XML, signed XML, signing metadata, and validation report.
 * @throws           KsefValidationBlockError if pre-submission validation fails.
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

  // ── Generate XML ──
  const rawXml = buildFa2Xml(invoice);

  // ── Pre-submission validation gate ──
  const xmlValidation = validateFa3Xml(rawXml, invoice);
  const report = generateValidationReport(rawXml, invoice, xmlValidation);

  if (!report.readyForKsef) {
    throw new KsefValidationBlockError(report);
  }

  // ── Sign XML ──
  const signed = signInvoiceXml(rawXml);

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
    validationReport: report,
  };
}

// ─── Re-exports ────────────────────────────────────────────────────────────────

export { buildFa2Xml }          from './xml-builder';
export { validateFa3Xml }       from './xml-validator';
export { generateValidationReport, type PreSubmissionReport } from './validation-report';
export { computeVatSummary, type VatSummaryResult } from './vat-summary-engine';
export { FA_ELEMENT_SEQUENCE, P13_FIELDS, VALID_P12_VALUES } from './fa3-schema';
export { signInvoiceXml,
         signXml,
         signXmlMock,
         loadSigningCredentials } from './signer';
export type { SigningCredentials, SignedPayload } from './signer';
