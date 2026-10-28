import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { buildPlatformKsefPayload } from '@/lib/ksef/platform-submit';
import { buildKsefPayload, generateValidationReport, type PreSubmissionReport } from '@/lib/ksef';
import { validateKsefSubmission, buildFieldMappings, type KsefDebugLogEntry } from '@/lib/ksef/diagnostics';
import { validateFa3Xml, type XmlValidationResult } from '@/lib/ksef/xml-validator';
import { computeVatSummary, getActiveCategories } from '@/lib/ksef/vat-summary-engine';
import { detectCorrectionType, type CorrectionTypeInfo } from '@/lib/ksef/correction-serializer';
import type { IssuedInvoiceWithItems } from '@/types/issued-invoice';

/**
 * GET /api/owner/invoices/[id]/ksef-diagnostics
 *
 * Owner-only diagnostics endpoint. Works with BOTH invoice types:
 * - issued_invoices (user-created invoices shown in admin invoice detail)
 * - platform_invoices (SaaS billing invoices)
 *
 * Returns:
 * - Pre-submission validation results (missing fields, warnings)
 * - Field mapping verification (invoice field -> KSeF XML element)
 * - Generated XML (if buildable)
 * - KSeF submission status, reference number, response payload
 * - Historical debug logs from ksef_debug_logs table
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: u } = await (supabase as any)
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (u?.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Try issued_invoices first (the table used by admin invoice detail) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: issuedInvoice } = await (supabase as any)
      .from('issued_invoices')
      .select(`
        id, company_id, invoice_number, status, currency,
        issue_date, sale_date, due_date, payment_method,
        seller_name, seller_nip, seller_address, seller_bank_account,
        buyer_name, buyer_nip, buyer_address, buyer_email,
        net_total, vat_total, gross_total, notes,
        document_type, original_invoice_id, correction_reason,
        corrected_invoice_number, corrected_invoice_date,
        ksef_reference_no, ksef_status, ksef_error_message,
        ksef_sent_at, ksef_accepted_at
      `)
      .eq('id', params.id)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let invoiceSource: 'issued' | 'platform' = 'issued';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let invoice: any = issuedInvoice;

    // If not in issued_invoices, try platform_invoices
    if (!invoice) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: platInv } = await (supabase as any)
        .from('platform_invoices')
        .select(`
          id, invoice_number, invoice_date, status, payment_method, due_date,
          currency, metadata, issued_by,
          ksef_number, ksef_status, ksef_response, ksef_reference_no,
          ksef_submitted_at, ksef_last_attempt_at,
          ksef_submission_id
        `)
        .eq('id', params.id)
        .maybeSingle();
      invoice = platInv;
      invoiceSource = 'platform';
    }

    if (!invoice) {
      return NextResponse.json({
        invoiceId: params.id,
        error: 'Faktura nie znaleziona w issued_invoices ani platform_invoices.',
      }, { status: 404 });
    }

    // ── Build validation input based on invoice source ──
    let validationInput: Record<string, unknown>;
    let rawXml: string | null = null;

    if (invoiceSource === 'issued') {
      // issued_invoices has all fields directly
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: items } = await (supabase as any)
        .from('issued_invoice_items')
        .select('id, position, name, unit, quantity, unit_price_net, vat_rate, net_amount, vat_amount, gross_amount, discount_pct')
        .eq('invoice_id', params.id)
        .order('position', { ascending: true });

      validationInput = {
        invoice_number:    invoice.invoice_number ?? null,
        issue_date:        invoice.issue_date ?? null,
        due_date:          invoice.due_date ?? null,
        payment_method:    invoice.payment_method ?? null,
        currency:          invoice.currency ?? 'PLN',
        document_type:     invoice.document_type ?? 'STANDARD',
        seller_name:       invoice.seller_name ?? null,
        seller_nip:        invoice.seller_nip ?? null,
        seller_address:    invoice.seller_address ?? null,
        seller_bank_account: invoice.seller_bank_account ?? null,
        buyer_name:        invoice.buyer_name ?? null,
        buyer_nip:         invoice.buyer_nip ?? null,
        buyer_address:     invoice.buyer_address ?? null,
        net_total:         invoice.net_total ?? null,
        vat_total:         invoice.vat_total ?? null,
        gross_total:       invoice.gross_total ?? null,
        items:             items ?? [],
        corrected_invoice_number: invoice.corrected_invoice_number ?? null,
        corrected_invoice_date:   invoice.corrected_invoice_date ?? null,
        correction_reason:        invoice.correction_reason ?? null,
      };

      // Build XML from issued_invoices via buildKsefPayload
      try {
        const payload = await buildKsefPayload(params.id);
        rawXml = payload.rawXml;
      } catch {
        // Draft or no items — fine
      }
    } else {
      // platform_invoices — data is in metadata JSON
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = (invoice as any).metadata ?? {};

      // Fetch seller company
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: issuer } = await (supabase as any)
        .from('users')
        .select('company_id')
        .eq('id', (invoice as any).issued_by)
        .maybeSingle();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: company } = issuer?.company_id
        ? await (supabase as any)
            .from('companies')
            .select('id, nip, name, address, city, zip, country')
            .eq('id', issuer.company_id)
            .maybeSingle()
        : { data: null };

      const sellerAddress = [company?.address, [company?.zip, company?.city].filter(Boolean).join(' '), company?.country]
        .filter(Boolean).join(', ');

      validationInput = {
        invoice_number:    invoice.invoice_number ?? null,
        issue_date:        invoice.invoice_date ?? null,
        due_date:          invoice.due_date ?? null,
        payment_method:    invoice.payment_method ?? null,
        currency:          invoice.currency ?? meta.currency ?? 'PLN',
        document_type:     meta.document_type ?? 'STANDARD',
        seller_name:       company?.name ?? meta.seller_name ?? null,
        seller_nip:        company?.nip ?? meta.seller_nip ?? null,
        seller_address:    sellerAddress || (meta.seller_address ?? null),
        seller_bank_account: meta.seller_bank_account ?? null,
        buyer_name:        meta.buyer_name ?? null,
        buyer_nip:         meta.buyer_nip ?? null,
        buyer_address:     meta.buyer_address ?? null,
        net_total:         meta.net_total ?? null,
        vat_total:         meta.vat_total ?? null,
        gross_total:       meta.gross_total ?? null,
        items:             meta.items ?? null,
        corrected_invoice_number: meta.corrected_invoice_number ?? null,
        corrected_invoice_date:   meta.corrected_invoice_date ?? null,
        correction_reason:        meta.correction_reason ?? null,
      };

      // Build XML from platform_invoices
      try {
        const payload = await buildPlatformKsefPayload(params.id);
        rawXml = payload.rawXml;
      } catch {
        // Fine
      }
    }

    const validation = validateKsefSubmission(validationInput as never);
    const fieldMappings = buildFieldMappings(validationInput as never);

    // ── FA(3) XML validation (schema + business rules) ──
    let xmlValidation: XmlValidationResult | null = null;
    let preSubmissionReport: PreSubmissionReport | null = null;
    if (rawXml) {
      try {
        xmlValidation = validateFa3Xml(rawXml, validationInput as unknown as IssuedInvoiceWithItems);
        preSubmissionReport = generateValidationReport(
          rawXml,
          validationInput as unknown as IssuedInvoiceWithItems,
          xmlValidation,
        );
      } catch {
        // If validation itself throws, don't block diagnostics display
      }
    }

    // ── VAT summary for display (computed from items) ──
    const itemsForSummary = (validationInput as { items?: unknown[] }).items ?? [];
    const vatSummary = itemsForSummary.length > 0
      ? computeVatSummary(itemsForSummary as never)
      : null;
    const activeCategories = vatSummary ? getActiveCategories(vatSummary.groups) : null;

    // ── Correction invoice diagnostics ──
    let correctionInfo: CorrectionTypeInfo | null = null;
    const docTypeForCorrection = (validationInput as { document_type?: string }).document_type;
    if (docTypeForCorrection === 'CORRECTION') {
      try {
        correctionInfo = detectCorrectionType(validationInput as unknown as IssuedInvoiceWithItems);
      } catch {
        // Non-critical — don't block diagnostics
      }
    }

    // ── Fetch debug logs (works for both invoice types) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawLogs } = await (supabase as any)
      .from('ksef_debug_logs')
      .select('id, event_type, status, message, payload, created_at')
      .eq('invoice_id', params.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const debugLogs: KsefDebugLogEntry[] = (rawLogs ?? []).map((log: Record<string, unknown>) => ({
      id:        log.id as string,
      eventType: log.event_type as string,
      status:    log.status as string,
      message:   log.message as string | null,
      payload:   log.payload as Record<string, unknown> | null,
      createdAt: log.created_at as string,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invAny = invoice as any;

    return NextResponse.json({
      invoiceId:           params.id,
      invoiceNumber:       invoice.invoice_number ?? null,
      invoiceSource,
      valid:               validation.valid,
      validationPassed:    validation.valid,
      missingFields:       validation.missingFields,
      warnings:            validation.warningFields,
      xmlGenerated:        rawXml !== null,
      submitted:           !!(invAny.ksef_sent_at ?? invAny.ksef_submitted_at),
      validation,
      fieldMappings,
      rawXml,
      generatedXml:        rawXml,
      requestPayload:      null,
      ksefNumber:           invAny.ksef_number ?? null,
      ksefReferenceNumber:  invAny.ksef_reference_no ?? null,
      ksefStatus:           invAny.ksef_status ?? null,
      ksefErrorMessage:     invAny.ksef_error_message ?? null,
      submissionDate:       invAny.ksef_sent_at ?? invAny.ksef_submitted_at ?? null,
      lastAttemptDate:      invAny.ksef_last_attempt_at ?? invAny.ksef_sent_at ?? null,
      lastAttempt:          invAny.ksef_last_attempt_at ?? invAny.ksef_sent_at ?? null,
      submissionId:         invAny.ksef_submission_id ?? null,
      responsePayload:      invAny.ksef_response ?? invAny.ksef_error_message ?? null,
      debugLogs,
      xmlValidation,
      preSubmissionReport,
      vatSummary,
      activeCategories,
      correctionInfo,
      correctedInvoiceNumber: (validationInput as { corrected_invoice_number?: string | null }).corrected_invoice_number ?? null,
      correctedInvoiceDate:   (validationInput as { corrected_invoice_date?: string | null }).corrected_invoice_date ?? null,
      correctedInvoiceKsefNo: (validationInput as { corrected_invoice_ksef_no?: string | null }).corrected_invoice_ksef_no ?? null,
    });
  } catch (err) {
    return NextResponse.json({
      error: 'KSeF diagnostics error',
      message: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
