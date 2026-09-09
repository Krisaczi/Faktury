import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { generateIdempotencyKey, submitToKsef, type KsefStatus } from '@/lib/ksef/submit';
import { buildPlatformKsefPayload } from '@/lib/ksef/platform-submit';

/**
 * POST /api/owner/invoices/[id]/send-to-ksef
 *
 * Manually submit (or resubmit) a platform invoice to KSeF.
 * Returns the current KSeF status and response.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await getSupabaseServerClient();
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

  // Load the invoice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice } = await (supabase as any)
    .from('platform_invoices')
    .select('id, status, invoice_number, invoice_date, entity_id, ksef_number, ksef_status, ksef_submission_id, ksef_response, metadata')
    .eq('id', params.id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: 'Faktura nie znaleziona.' }, { status: 404 });
  }

  if (invoice.status === 'draft') {
    return NextResponse.json({ error: 'Faktura jest szkicem — wystaw ją najpierw.' }, { status: 400 });
  }

  // Load company for NIP
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('id, nip')
    .eq('id', invoice.entity_id)
    .maybeSingle();

  if (!company?.nip) {
    return NextResponse.json({ error: 'Firma nie ma numeru NIP — wymagany do KSeF.' }, { status: 400 });
  }

  // Load KSeF credentials
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: creds } = await (supabase as any)
    .from('ksef_credentials')
    .select('token, environment')
    .eq('company_id', invoice.entity_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!creds?.token) {
    return NextResponse.json({
      error: 'Brak danych logowania KSeF dla tej firmy. Dodaj token KSeF w ustawieniach.',
    }, { status: 400 });
  }

  // Build the KSeF XML payload
  let signedXml: string;
  try {
    const payload = await buildPlatformKsefPayload(params.id);
    signedXml = payload.signedXml;
  } catch (err) {
    return NextResponse.json({
      error: `Błąd budowania XML: ${(err as Error).message}`,
    }, { status: 500 });
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
    actor_id:   user.id,
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

  // KSeF submission audit (dedicated audit table)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('ksef_submission_audit').insert({
    invoice_id:       params.id,
    invoice_type:     'platform',
    actor_id:         user.id,
    attempt_result:   result.status,
    response_payload: result.response,
    error_message:    result.error ?? null,
    ip:               ownerIp,
  });

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
    return NextResponse.json({
      ok:           false,
      ksefStatus:   result.status as KsefStatus,
      error:        result.error,
      ksefResponse: result.response,
      message:      'KSeF odrzucił fakturę. Sprawdź szczegóły i popraw błędy.',
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
