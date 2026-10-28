import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { buildPlatformKsefPayload } from '@/lib/ksef/platform-submit';
import { validateKsefSubmission, buildFieldMappings, type KsefDebugLogEntry } from '@/lib/ksef/diagnostics';

/**
 * GET /api/owner/invoices/[id]/ksef-diagnostics
 *
 * Owner-only diagnostics endpoint. Returns:
 * - Pre-submission validation results (missing fields, warnings)
 * - Field mapping verification (invoice field → KSeF XML element)
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

  // Fetch the invoice with all fields needed for validation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice, error: invErr } = await (supabase as any)
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

  if (!invoice || invErr) {
    return NextResponse.json({
      error: 'Faktura nie znaleziona.',
      invoiceId: params.id,
    }, { status: 404 });
  }

  // Fetch the seller company data
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

  // Build the invoice shape for validation from platform_invoices + metadata
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = (invoice as any).metadata ?? {};
  const sellerAddress = [company?.address, [company?.zip, company?.city].filter(Boolean).join(' '), company?.country]
    .filter(Boolean).join(', ');

  const validationInput = {
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

  const validation = validateKsefSubmission(validationInput);
  const fieldMappings = buildFieldMappings(validationInput);

  // Build the current XML payload
  let rawXml: string | null = null;
  try {
    const payload = await buildPlatformKsefPayload(params.id);
    rawXml = payload.rawXml;
  } catch {
    // Invoice might be a draft or have no items — that's fine
  }

  // Fetch debug logs
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
    invoiceId:         params.id,
    invoiceNumber:     invoice.invoice_number ?? null,
    valid:             validation.valid,
    validationPassed:  validation.valid,
    missingFields:     validation.missingFields,
    warnings:          validation.warningFields,
    xmlGenerated:      rawXml !== null,
    submitted:         !!invAny.ksef_submitted_at,
    validation,
    fieldMappings,
    rawXml,
    generatedXml:      rawXml,
    requestPayload:    null,
    ksefNumber:        invAny.ksef_number ?? null,
    ksefReferenceNumber: invAny.ksef_reference_no ?? null,
    ksefStatus:        invAny.ksef_status ?? null,
    submissionDate:    invAny.ksef_submitted_at ?? null,
    lastAttemptDate:   invAny.ksef_last_attempt_at ?? null,
    lastAttempt:       invAny.ksef_last_attempt_at ?? null,
    submissionId:      invAny.ksef_submission_id ?? null,
    responsePayload:   invAny.ksef_response ?? null,
    debugLogs,
  });
  } catch (err) {
    return NextResponse.json({
      error: 'KSeF diagnostics error',
      message: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
