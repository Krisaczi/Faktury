import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { generateIdempotencyKey, submitToKsef } from '@/lib/ksef/submit';
import { buildPlatformKsefPayload } from '@/lib/ksef/platform-submit';

/**
 * POST /api/owner/invoices/bulk-send-to-ksef
 *
 * Bulk resubmit multiple platform invoices to KSeF.
 * Owner-only. Returns per-invoice results with success/failure summary.
 *
 * Body: { invoiceIds: string[] }
 */
export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const invoiceIds = Array.isArray(body.invoiceIds) ? body.invoiceIds as string[] : [];

  if (invoiceIds.length === 0) {
    return NextResponse.json({ error: 'Brak faktur do wysłania.' }, { status: 400 });
  }

  if (invoiceIds.length > 50) {
    return NextResponse.json({ error: 'Maksymalnie 50 faktur na raz.' }, { status: 400 });
  }

  const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const nowIso = new Date().toISOString();
  const correlationId = crypto.randomUUID();

  const results: Array<{
    invoiceId:   string;
    success:     boolean;
    ksefStatus?: string;
    ksefNumber?: string;
    error?:      string;
  }> = [];

  let succeeded = 0;
  let failed = 0;
  let queued = 0;

  for (const invoiceId of invoiceIds) {
    try {
      // Load invoice
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: invoice } = await (supabase as any)
        .from('platform_invoices')
        .select('id, status, entity_id, ksef_number, ksef_status')
        .eq('id', invoiceId)
        .maybeSingle();

      if (!invoice) {
        results.push({ invoiceId, success: false, error: 'Faktura nie znaleziona.' });
        failed++;
        continue;
      }

      if (invoice.status === 'draft') {
        results.push({ invoiceId, success: false, error: 'Faktura jest szkicem.' });
        failed++;
        continue;
      }

      // Skip if already accepted
      if (invoice.ksef_status === 'accepted' || invoice.ksef_number) {
        results.push({ invoiceId, success: true, ksefStatus: 'accepted', ksefNumber: invoice.ksef_number });
        succeeded++;
        continue;
      }

      // Load company
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: company } = await (supabase as any)
        .from('companies')
        .select('nip')
        .eq('id', invoice.entity_id)
        .maybeSingle();

      if (!company?.nip) {
        results.push({ invoiceId, success: false, error: 'Brak NIP firmy.' });
        failed++;
        continue;
      }

      // Load credentials
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: creds } = await (supabase as any)
        .from('ksef_credentials')
        .select('token, environment')
        .eq('company_id', invoice.entity_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!creds?.token) {
        results.push({ invoiceId, success: false, error: 'Brak danych logowania KSeF.' });
        failed++;
        continue;
      }

      // Build XML
      let signedXml: string;
      try {
        const payload = await buildPlatformKsefPayload(invoiceId);
        signedXml = payload.signedXml;
      } catch (xmlErr) {
        results.push({ invoiceId, success: false, error: `Błąd XML: ${(xmlErr as Error).message}` });
        failed++;
        continue;
      }

      const idempotencyKey = generateIdempotencyKey(invoiceId);

      // Create submission job
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('ksef_submission_jobs').insert({
        invoice_id:      invoiceId,
        invoice_type:    'platform',
        attempt_count:   1,
        max_attempts:    5,
        status:          'pending',
        idempotency_key: idempotencyKey,
      });

      // Submit
      const submitResult = await submitToKsef({
        invoiceId,
        signedXml,
        idempotencyKey,
        credentials:     { token: creds.token, environment: creds.environment as 'test' | 'prod' },
        companyNip:      company.nip,
        existingKsefNumber: invoice.ksef_number,
      });

      // Update invoice
      const updateFields: Record<string, unknown> = {
        ksef_status:         submitResult.status,
        ksef_response:       submitResult.response,
        ksef_last_attempt_at: nowIso,
      };
      if (submitResult.ksefNumber) updateFields.ksef_number = submitResult.ksefNumber;
      if (submitResult.submissionId) updateFields.ksef_submission_id = submitResult.submissionId;
      if (submitResult.status === 'submitted' || submitResult.status === 'accepted') {
        updateFields.ksef_submitted_at = nowIso;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('platform_invoices').update(updateFields).eq('id', invoiceId);

      // Write audit
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('ksef_submission_audit').insert({
        invoice_id:       invoiceId,
        invoice_type:     'platform',
        actor_id:         user.id,
        attempt_result:   submitResult.status,
        response_payload: submitResult.response,
        error_message:    submitResult.error ?? null,
        ip:               ownerIp,
        correlation_id:  correlationId,
      });

      if (submitResult.success) {
        succeeded++;
        results.push({ invoiceId, success: true, ksefStatus: submitResult.status, ksefNumber: submitResult.ksefNumber });
      } else if (submitResult.transient) {
        queued++;
        results.push({ invoiceId, success: false, ksefStatus: 'queued', error: submitResult.error });
      } else {
        failed++;
        results.push({ invoiceId, success: false, ksefStatus: submitResult.status, error: submitResult.error });
      }
    } catch (err) {
      failed++;
      results.push({ invoiceId, success: false, error: `Błąd: ${(err as Error).message}` });
    }
  }

  return NextResponse.json({
    ok:       true,
    correlationId,
    summary:  { total: invoiceIds.length, succeeded, failed, queued },
    results,
  });
}
