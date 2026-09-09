import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * POST /api/owner/invoices/:id/issue
 *
 * Finalizes a draft invoice: assigns invoice number (auto-generated or manual),
 * sets status=issued, persists immutable tax snapshot, records issuedBy/issuedAt/dueDate.
 *
 * Body (optional):
 *   invoiceNumber: string — manual invoice number (required if autoGenerateNumber is false)
 *   invoiceDate:   string — ISO date for the invoice issue date (defaults to today)
 *   autoGenerateNumber: boolean — if true, generate number via RPC; if false, use invoiceNumber
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice } = await (supabase as any)
    .from('platform_invoices')
    .select('id, status, entity_id, vat_rate_percent, tax_breakdown, tax_total_cents, price_includes_tax, invoice_number, invoice_date, metadata')
    .eq('id', params.id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: 'Faktura nie znaleziona.' }, { status: 404 });
  }

  if (invoice.status !== 'draft') {
    return NextResponse.json({ error: 'Faktura nie jest szkicem.' }, { status: 400 });
  }

  // Parse request body for manual number/date override
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const autoGenerate = body.autoGenerateNumber !== false && invoice.metadata?.autoGenerateNumber !== false;
  const manualNumber = typeof body.invoiceNumber === 'string' ? body.invoiceNumber.trim() : (invoice.invoice_number ?? '');
  const requestedDate = typeof body.invoiceDate === 'string' ? body.invoiceDate : (invoice.invoice_date ?? null);

  let invoiceNumber: string;

  if (autoGenerate) {
    // Generate invoice number via RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: generatedNumber, error: numErr } = await (supabase as any)
      .rpc('generate_platform_invoice_number');

    if (numErr || !generatedNumber) {
      console.error('[issue] number generation error', numErr);
      return NextResponse.json({ error: 'Błąd generowania numeru faktury.' }, { status: 500 });
    }
    invoiceNumber = generatedNumber;
  } else {
    // Manual invoice number — validate non-empty
    if (!manualNumber) {
      return NextResponse.json({ error: 'Numer faktury jest wymagany.' }, { status: 400 });
    }
    // Validate uniqueness (exclude self)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('platform_invoices')
      .select('id')
      .eq('invoice_number', manualNumber)
      .neq('id', params.id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'Numer faktury już istnieje.' }, { status: 409 });
    }
    invoiceNumber = manualNumber;
  }

  const now = new Date();
  const invoiceDateValue = requestedDate || now.toISOString().split('T')[0];
  const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString();

  // Persist immutable tax snapshot
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (supabase as any)
    .from('platform_invoices')
    .update({
      invoice_number:         invoiceNumber,
      invoice_date:           invoiceDateValue,
      status:                 'issued',
      issued_by:              user.id,
      issued_at:              nowIso,
      due_date:               dueDate.toISOString().split('T')[0],
      updated_at:             nowIso,
      tax_snapshot_taken_at:  nowIso,
    })
    .eq('id', params.id);

  if (updateErr) {
    console.error('[issue] update error', updateErr);
    return NextResponse.json({ error: 'Błąd wystawiania faktury.' }, { status: 500 });
  }

  const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('platform_invoice_audit').insert({
    invoice_id: params.id,
    actor_id:   user.id,
    action:     'issued',
    ip:         ownerIp,
    payload:    {
      invoiceNumber,
      invoiceDate: invoiceDateValue,
      dueDate: dueDate.toISOString().split('T')[0],
      taxSnapshot: {
        vatRatePercent:  invoice.vat_rate_percent,
        taxTotalCents:   invoice.tax_total_cents,
        taxBreakdown:    invoice.tax_breakdown,
        priceIncludesTax: invoice.price_includes_tax,
      },
    },
  });

  // Audit: tax_snapshot_created
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('platform_invoice_audit').insert({
    invoice_id: params.id,
    actor_id:   user.id,
    action:     'tax_snapshot_created',
    ip:         ownerIp,
    payload:    {
      vatRatePercent:   invoice.vat_rate_percent,
      taxTotalCents:    invoice.tax_total_cents,
      taxBreakdown:     invoice.tax_breakdown,
      priceIncludesTax: invoice.price_includes_tax,
    },
  });

  // ─── KSeF submission (best-effort, non-blocking) ──────────────────────────
  // After issuance, attempt to submit to KSeF. If KSeF credentials exist
  // for the company, we try synchronous submission. If it fails transiently,
  // we queue it for retry. Email delivery (send endpoint) is called separately
  // by the frontend and is NOT blocked by KSeF outcome.
  let ksefResult: { ksefStatus?: string; ksefNumber?: string; error?: string; transient?: boolean } | null = null;

  try {
    // Load company NIP
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: company } = await (supabase as any)
      .from('companies')
      .select('nip')
      .eq('id', invoice.entity_id)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: creds } = await (supabase as any)
      .from('ksef_credentials')
      .select('token, environment')
      .eq('company_id', invoice.entity_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (company?.nip && creds?.token) {
      const { generateIdempotencyKey, submitToKsef } = await import('@/lib/ksef/submit');
      const { buildPlatformKsefPayload } = await import('@/lib/ksef/platform-submit');
      const idempotencyKey = generateIdempotencyKey(params.id);

      // Build XML payload
      let signedXml: string | null = null;
      try {
        const ksefPayload = await buildPlatformKsefPayload(params.id);
        signedXml = ksefPayload.signedXml;
      } catch (xmlErr) {
        console.error('[issue] KSeF XML build error', xmlErr);
      }

      if (signedXml) {
        // Create submission job
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('ksef_submission_jobs').insert({
          invoice_id:      params.id,
          invoice_type:    'platform',
          attempt_count:   1,
          max_attempts:    5,
          status:          'pending',
          idempotency_key: idempotencyKey,
        });

        const submitResult = await submitToKsef({
          invoiceId:       params.id,
          signedXml,
          idempotencyKey,
          credentials:     { token: creds.token, environment: creds.environment as 'test' | 'prod' },
          companyNip:      company.nip,
        });

        // Update invoice with KSeF result
        const ksefUpdate: Record<string, unknown> = {
          ksef_status:         submitResult.status,
          ksef_response:       submitResult.response,
          ksef_last_attempt_at: nowIso,
        };
        if (submitResult.ksefNumber) ksefUpdate.ksef_number = submitResult.ksefNumber;
        if (submitResult.submissionId) ksefUpdate.ksef_submission_id = submitResult.submissionId;
        if (submitResult.status === 'submitted' || submitResult.status === 'accepted') {
          ksefUpdate.ksef_submitted_at = nowIso;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('platform_invoices').update(ksefUpdate).eq('id', params.id);

        // Update job status
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('ksef_submission_jobs')
          .update({ status: submitResult.status, last_error: submitResult.error ?? null, updated_at: nowIso })
          .eq('invoice_id', params.id)
          .eq('status', 'pending');

        // KSeF audit entry (platform_invoice_audit)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('platform_invoice_audit').insert({
          invoice_id: params.id,
          actor_id:   user.id,
          action:     'ksef_submission',
          ip:         ownerIp,
          payload:    {
            ksefStatus: submitResult.status,
            ksefNumber: submitResult.ksefNumber ?? null,
            success:    submitResult.success,
            error:      submitResult.error ?? null,
            transient:  submitResult.transient,
          },
        });

        // KSeF submission audit (dedicated audit table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('ksef_submission_audit').insert({
          invoice_id:       params.id,
          invoice_type:     'platform',
          actor_id:         user.id,
          attempt_result:   submitResult.status,
          response_payload: submitResult.response,
          error_message:    submitResult.error ?? null,
          ip:               ownerIp,
        });

        ksefResult = {
          ksefStatus: submitResult.status,
          ksefNumber: submitResult.ksefNumber,
          error:      submitResult.error,
          transient:  submitResult.transient,
        };
      }
    }
  } catch (ksefErr) {
    console.error('[issue] KSeF submission error (non-blocking)', ksefErr);
    ksefResult = { ksefStatus: 'queued', error: 'Błąd wysyłki KSeF — dodano do kolejki.', transient: true };
  }

  return NextResponse.json({
    ok:            true,
    invoiceNumber,
    invoiceDate:   invoiceDateValue,
    status:        'issued',
    issuedAt:      nowIso,
    dueDate:       dueDate.toISOString().split('T')[0],
    ksef:          ksefResult,
    taxSnapshot: {
      vatRatePercent:   invoice.vat_rate_percent,
      taxTotalCents:    invoice.tax_total_cents,
      taxBreakdown:     invoice.tax_breakdown,
    },
  });
}
