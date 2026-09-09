import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { createHmac } from 'node:crypto';

/**
 * POST /api/ksef/webhook
 *
 * Receives KSeF async callbacks for invoice submission status updates.
 * Validates the webhook signature, then updates the invoice's KSeF status.
 *
 * KSeF sends callbacks when:
 * - An invoice is accepted (ksef_number assigned)
 * - An invoice is rejected (with error details)
 *
 * The webhook is public (no auth) but validates a signature using a shared secret.
 */
export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();

  // CORS headers for webhook responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-KSeF-Signature',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const body = await req.text();
  const signature = req.headers.get('x-ksef-signature') ?? '';

  // Validate webhook signature
  const webhookSecret = process.env.KSEF_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[ksef-webhook] KSEF_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500, headers: corsHeaders });
  }

  const expectedSig = createHmac('sha256', webhookSecret).update(body).digest('hex');
  if (signature !== expectedSig) {
    console.warn('[ksef-webhook] Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401, headers: corsHeaders });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders });
  }

  const invoiceId = (payload.invoiceId ?? payload.invoice_id ?? payload.elementReferenceNumber) as string | undefined;
  const ksefNumber = (payload.ksefReferenceNumber ?? payload.ksef_number ?? payload.ksefNumber) as string | undefined;
  const status = (payload.status ?? payload.processingCode) as string | number | undefined;
  const submissionId = (payload.submissionId ?? payload.referenceNumber) as string | undefined;

  if (!invoiceId) {
    console.warn('[ksef-webhook] Missing invoiceId in payload');
    return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400, headers: corsHeaders });
  }

  // Determine KSeF status from callback
  let ksefStatus: 'accepted' | 'rejected';
  if (status === 200 || status === 'accepted' || ksefNumber) {
    ksefStatus = 'accepted';
  } else if (status === 400 || status === 'rejected') {
    ksefStatus = 'rejected';
  } else {
    // Unknown status — log but don't update
    console.warn('[ksef-webhook] Unknown status:', status);
    return NextResponse.json({ ok: true, message: 'Unknown status, no update' }, { headers: corsHeaders });
  }

  const nowIso = new Date().toISOString();

  // Update the platform invoice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateFields: Record<string, unknown> = {
    ksef_status:    ksefStatus,
    ksef_response:  payload,
    updated_at:     nowIso,
  };

  if (ksefNumber) {
    updateFields.ksef_number = ksefNumber;
  }
  if (submissionId) {
    updateFields.ksef_submission_id = submissionId;
  }
  if (ksefStatus === 'accepted') {
    updateFields.ksef_submitted_at = nowIso;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated } = await (supabase as any)
    .from('platform_invoices')
    .update(updateFields)
    .eq('id', invoiceId)
    .select('id, entity_id')
    .maybeSingle();

  if (!updated) {
    // Try issued_invoices table as well
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('issued_invoices')
      .update({
        ksef_status:     ksefStatus,
        ksef_number:     ksefNumber ?? null,
        ksef_response:   payload,
        ksef_submitted_at: ksefStatus === 'accepted' ? nowIso : null,
      })
      .eq('id', invoiceId);
  }

  // Update the submission job
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('ksef_submission_jobs')
    .update({
      status:     ksefStatus,
      updated_at: nowIso,
    })
    .eq('invoice_id', invoiceId)
    .eq('status', 'submitted');

  // Create audit entry
  if (updated) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('platform_invoice_audit').insert({
      invoice_id: invoiceId,
      actor_id:   null,
      action:     'ksef_webhook',
      ip:         req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      payload:    {
        ksefStatus,
        ksefNumber,
        submissionId,
        webhookPayload: payload,
      },
    });
  }

  console.info('[ksef-webhook] Updated invoice', invoiceId, 'to', ksefStatus);
  return NextResponse.json({ ok: true, ksefStatus }, { headers: corsHeaders });
}
