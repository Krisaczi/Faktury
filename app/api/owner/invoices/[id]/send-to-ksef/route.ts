import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { generateIdempotencyKey, submitToKsef, type KsefStatus } from '@/lib/ksef/submit';
import { buildPlatformKsefPayload } from '@/lib/ksef/platform-submit';
import { buildKsefPayload } from '@/lib/ksef';
import { validateFa3Xml } from '@/lib/ksef/xml-validator';
import { KsefDebugLogger, validateKsefSubmission } from '@/lib/ksef/diagnostics';

/**
 * POST /api/owner/invoices/[id]/send-to-ksef
 *
 * Manually submit (or resubmit) a platform invoice to KSeF.
 * Returns the current KSeF status and response.
 *
 * Supports two auth modes:
 * - User session (cookies): normal owner-initiated submission from the UI
 * - Service key (Authorization header): internal calls from the ksefRetryWorker edge function
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authHeader = _req.headers.get('authorization') ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const isInternalCall = !!(serviceKey && authHeader === `Bearer ${serviceKey}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let supabase: any;
  let actorId: string;

  if (isInternalCall) {
    supabase = getSupabaseServiceClient();
    actorId = process.env.OWNER_USER_ID ?? '00000000-0000-0000-0000-000000000000';
  } else {
    supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: u } = await (supabase as any)
      .from('users')
      .select('role, company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (u?.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorId = user.id;
  }

  // Load the invoice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice } = await (supabase as any)
    .from('platform_invoices')
    .select('id, status, invoice_number, invoice_date, entity_id, issued_by, ksef_number, ksef_status, ksef_submission_id, ksef_response, metadata, payment_method, due_date')
    .eq('id', params.id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: 'Faktura nie znaleziona.' }, { status: 404 });
  }

  if (invoice.status === 'draft') {
    return NextResponse.json({ error: 'Faktura jest szkicem — wystaw ją najpierw.' }, { status: 400 });
  }

  // Load the seller company — for platform invoices, the seller is the
  // company of the user who issued the invoice (issued_by), NOT the buyer
  // (entity_id). KSeF requires the token to belong to the seller's NIP.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: issuer } = await (supabase as any)
    .from('users')
    .select('company_id')
    .eq('id', invoice.issued_by)
    .maybeSingle();

  const sellerCompanyId = issuer?.company_id;
  if (!sellerCompanyId) {
    return NextResponse.json({ error: 'Nie znaleziono firmy sprzedawcy.' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('id, nip')
    .eq('id', sellerCompanyId)
    .maybeSingle();

  if (!company?.nip) {
    return NextResponse.json({ error: 'Firma sprzedawcy nie ma numeru NIP — wymagany do KSeF.' }, { status: 400 });
  }

  // Load KSeF credentials for the SELLER's company.
  // The "Owner can read all KSeF credentials" RLS policy
  // allows the owner to read credentials for any company, so the authenticated
  // client works here — no service client needed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: credsRows } = await (supabase as any)
    .from('ksef_credentials')
    .select('token, environment')
    .eq('company_id', sellerCompanyId)
    .order('updated_at', { ascending: false })
    .limit(1);
  const creds = Array.isArray(credsRows) && credsRows.length > 0 ? credsRows[0] : null;

  if (!creds?.token) {
    return NextResponse.json({
      error: 'Brak danych logowania KSeF dla tej firmy. Dodaj token KSeF w ustawieniach.',
    }, { status: 400 });
  }

  // Pre-submission validation
  const dbgLogger = new KsefDebugLogger(supabase, params.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = (invoice as any).metadata ?? {};
  const sellerAddress = [company?.name, company?.nip].filter(Boolean).join(' ');
  const validationInput = {
    invoice_number: invoice.invoice_number,
    issue_date: invoice.invoice_date,
    due_date: invoice.due_date,
    payment_method: invoice.payment_method,
    currency: meta.currency ?? 'PLN',
    document_type: meta.document_type ?? 'STANDARD',
    seller_name: sellerAddress || null,
    seller_nip: company?.nip ?? null,
    seller_bank_account: meta.seller_bank_account ?? null,
    buyer_name: meta.buyer_name ?? null,
    buyer_nip: meta.buyer_nip ?? null,
    net_total: meta.net_total ?? null,
    gross_total: meta.gross_total ?? null,
    items: meta.items ?? null,
    corrected_invoice_number: meta.corrected_invoice_number ?? null,
    corrected_invoice_date: meta.corrected_invoice_date ?? null,
    correction_reason: meta.correction_reason ?? null,
  };
  const validation = validateKsefSubmission(validationInput);
  if (!validation.valid) {
    await dbgLogger.log('VALIDATION_FAILED', 'failed',
      `Pre-submission validation failed: ${validation.errors.length} error(s)`,
      { errors: validation.errors.map(e => ({ field: e.field, message: e.message, ksefField: e.ksefField })) });
    return NextResponse.json({
      ok: false,
      error: 'KSeF validation failed',
      validation,
      message: `Missing or invalid fields: ${validation.errors.map(e => e.label).join(', ')}`,
    }, { status: 422 });
  }
  await dbgLogger.log('VALIDATION_PASSED', 'passed', 'All required fields present');

  // Build the KSeF XML payload
  let signedXml: string;
  let rawXmlForDebug: string | null = null;
  try {
    const payload = await buildPlatformKsefPayload(params.id);
    signedXml = payload.signedXml;
    rawXmlForDebug = payload.rawXml;
    await dbgLogger.log('XML_GENERATED', 'info', `XML generated (${rawXmlForDebug.length} chars)`, { xmlSize: rawXmlForDebug.length });
  } catch (err) {
    await dbgLogger.log('XML_GENERATED', 'failed', `XML build error: ${(err as Error).message}`);
    return NextResponse.json({
      error: `Błąd budowania XML: ${(err as Error).message}`,
    }, { status: 500 });
  }

  // FA(3) XML validation — block submission if schema or business rules fail
  if (rawXmlForDebug) {
    // Rebuild the mapped invoice for validation context
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (invoice as any).metadata ?? {};
    const mappedItems = meta.items ?? [];
    const docType = meta.document_type ?? 'STANDARD';
    const mappedInvoice = {
      net_total: meta.net_total ?? 0,
      gross_total: meta.gross_total ?? 0,
      vat_total: meta.vat_total ?? 0,
      document_type: docType,
      corrected_invoice_number: meta.corrected_invoice_number ?? null,
      corrected_invoice_date: meta.corrected_invoice_date ?? null,
      corrected_invoice_ksef_no: meta.corrected_invoice_ksef_no ?? null,
      correction_reason: meta.correction_reason ?? null,
      items: mappedItems,
    } as unknown as import('@/types/issued-invoice').IssuedInvoiceWithItems;

    const xmlValidation = validateFa3Xml(rawXmlForDebug, mappedInvoice);
    if (!xmlValidation.valid) {
      const errorDetails = xmlValidation.errors.map(e => ({
        rule: e.rule,
        element: e.element,
        message: e.message,
        detail: e.detail,
      }));
      await dbgLogger.log('VALIDATION_FAILED', 'failed',
        `FA(3) XML validation failed: ${xmlValidation.errors.length} error(s)`,
        { errors: errorDetails, summaryCheck: xmlValidation.summaryCheck });
      return NextResponse.json({
        ok: false,
        error: 'FA(3) XML validation failed — submission blocked',
        xmlValidation,
        message: xmlValidation.errors.map(e => e.message).join('; '),
      }, { status: 422 });
    }
    await dbgLogger.log('VALIDATION_PASSED', 'passed', 'FA(3) XML validation passed', {
      summaryCheck: xmlValidation.summaryCheck,
    });
  }

  const idempotencyKey = generateIdempotencyKey(params.id);
  const nowIso = new Date().toISOString();

  // Create a submission job record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job } = await (supabase as any)
    .from('ksef_submission_jobs')
    .insert({
      invoice_id:      params.id,
      invoice_type:    'platform',
      attempt_count:   1,
      max_attempts:    5,
      status:          'pending',
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single();

  // Update last attempt timestamp
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('platform_invoices')
    .update({ ksef_last_attempt_at: nowIso })
    .eq('id', params.id);

  // Submit to KSeF
  await dbgLogger.log('SUBMISSION_STARTED', 'started', `Submitting invoice ${invoice.invoice_number} to KSeF`, {
    invoiceId: params.id,
    invoiceNumber: invoice.invoice_number,
    xmlSize: signedXml.length,
    timestamp: nowIso,
  });
  const result = await submitToKsef({
    invoiceId:          params.id,
    signedXml,
    idempotencyKey,
    credentials:        { token: creds.token, environment: creds.environment as 'test' | 'prod' },
    companyNip:         company.nip,
    existingKsefNumber: invoice.ksef_number,
  });

  // Update invoice and job with result
  const updateFields: Record<string, unknown> = {
    ksef_status:         result.status,
    ksef_response:       result.response,
    ksef_last_attempt_at: nowIso,
  };

  if (result.ksefNumber) {
    updateFields.ksef_number = result.ksefNumber;
  }
  if (result.submissionId) {
    updateFields.ksef_submission_id = result.submissionId;
  }
  if (result.status === 'submitted' || result.status === 'accepted') {
    updateFields.ksef_submitted_at = nowIso;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('platform_invoices')
    .update(updateFields)
    .eq('id', params.id);

  if (job) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('ksef_submission_jobs')
      .update({
        status:      result.status,
        last_error:  result.error ?? null,
        updated_at:  nowIso,
      })
      .eq('id', job.id);
  }

  // Audit entry
  const ownerIp = _req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('platform_invoice_audit').insert({
    invoice_id: params.id,
    actor_id:   actorId,
    action:     'ksef_submission',
    ip:         ownerIp,
    payload:    {
      ksefStatus:   result.status,
      ksefNumber:   result.ksefNumber ?? null,
      success:      result.success,
      error:        result.error ?? null,
      transient:    result.transient,
      jobId:        job?.id ?? null,
      manualResubmit: true,
    },
  });

  // KSeF submission audit (dedicated audit table with XML payload + sent values)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('ksef_submission_audit').insert({
    invoice_id:           params.id,
    invoice_type:         'platform',
    actor_id:             actorId,
    attempt_result:       result.status,
    ksef_number:          result.ksefNumber ?? null,
    payment_method_sent:  invoice.payment_method ?? null,
    due_date_sent:        invoice.due_date ?? null,
    xml_payload:          rawXmlForDebug,
    response_payload:     result.response,
    error_message:        result.error ?? null,
    ip:                   ownerIp,
  });

  // Log the result
  if (result.success && result.status === 'accepted') {
    await dbgLogger.log('SUBMISSION_ACCEPTED', 'accepted',
      `KSeF accepted invoice. KSeF number: ${result.ksefNumber ?? 'pending'}`,
      { ksefNumber: result.ksefNumber, submissionId: result.submissionId });
  } else if (!result.success) {
    await dbgLogger.log('SUBMISSION_REJECTED', 'rejected',
      `KSeF rejected: ${result.error ?? 'Unknown error'}`,
      { error: result.error, response: result.response });
  }
  await dbgLogger.log('RESPONSE_RECEIVED', result.success ? 'accepted' : 'rejected',
    `KSeF response: status=${result.status}`,
    { status: result.status, ksefNumber: result.ksefNumber, error: result.error, response: result.response });

  if (result.transient) {
    return NextResponse.json({
      ok:           false,
      ksefStatus:   result.status as KsefStatus,
      error:        result.error,
      transient:    true,
      message:      'Wystąpił błąd połączenia z KSeF. Faktura została dodana do kolejki ponownych prób.',
    }, { status: 202 });
  }

  if (!result.success) {
    const v = result.validation;
    // eslint-disable-next-line no-console
    console.error('[KSeF Validation]', {
      session: v?.sessionReferenceNumber ?? null,
      invoice: v?.invoiceReferenceNumber ?? null,
      status: 'Rejected',
      errorCode: v?.validationCode ?? null,
      businessRule: v?.businessRuleId ?? null,
      validationRule: v?.validationRule ?? null,
      xpath: v?.errorPath ?? null,
      element: v?.fieldName ?? null,
      message: v?.validationMessage ?? v?.detailedErrorMessage ?? null,
      processingCode: v?.processingCode ?? null,
      processingDescription: v?.processingDescription ?? null,
      rawResponse: result.response,
    });
    // Include raw XML in the stored response for debugging when rejected
    const debugResponse = rawXmlForDebug
      ? { ...result.response, _rawXml: rawXmlForDebug.slice(0, 8000) }
      : result.response;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('platform_invoices')
      .update({ ksef_response: debugResponse })
      .eq('id', params.id);
    return NextResponse.json({
      ok:           false,
      ksefStatus:   result.status as KsefStatus,
      error:        result.error,
      ksefResponse: result.response,
      validation:   result.validation ?? null,
      message:      result.validation?.validationMessage
        ? `KSeF odrzucił fakturę: [${result.validation.validationCode ?? 'brak kodu'}] ${result.validation.validationMessage}${result.validation.errorPath ? ` (XPath: ${result.validation.errorPath})` : ''}${result.validation.businessRuleId ? ` (regula: ${result.validation.businessRuleId})` : ''}`
        : 'KSeF odrzucił fakturę. Sprawdź szczegóły i popraw błędy.',
    }, { status: 422 });
  }

  return NextResponse.json({
    ok:           true,
    ksefStatus:   result.status as KsefStatus,
    ksefNumber:   result.ksefNumber,
    submissionId: result.submissionId,
    message:      'Faktura przesłana do KSeF.',
  });
}
