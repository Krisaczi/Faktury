import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { buildPlatformKsefPayload } from '@/lib/ksef/platform-submit';

/**
 * GET /api/owner/invoices/[id]/ksef-payload
 *
 * Owner-only diagnostic endpoint: returns the raw XML, signed XML,
 * payment method, and due date that would be (or was) sent to KSeF.
 * Also returns the latest audit record if one exists.
 */
export async function GET(
  _req: NextRequest,
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

  // Fetch the invoice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice } = await (supabase as any)
    .from('platform_invoices')
    .select('id, invoice_number, status, payment_method, due_date, ksef_number, ksef_status, ksef_response')
    .eq('id', params.id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: 'Faktura nie znaleziona.' }, { status: 404 });
  }

  // Fetch the latest audit record for this invoice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: auditRecord } = await (supabase as any)
    .from('ksef_submission_audit')
    .select('id, ksef_number, payment_method_sent, due_date_sent, xml_payload, attempt_result, error_message, created_at')
    .eq('invoice_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Build the current XML payload (shows what WOULD be sent now)
  let rawXml: string | null = null;
  let signedXml: string | null = null;
  try {
    const payload = await buildPlatformKsefPayload(params.id);
    rawXml = payload.rawXml;
    signedXml = payload.signedXml;
  } catch (err) {
    // Invoice might be a draft or have no items — that's fine
  }

  return NextResponse.json({
    invoiceId:        params.id,
    invoiceNumber:    invoice.invoice_number,
    status:           invoice.status,
    ksefNumber:       invoice.ksef_number ?? null,
    ksefStatus:       invoice.ksef_status ?? null,
    paymentMethod:    invoice.payment_method ?? null,
    dueDate:          invoice.due_date ?? null,
    rawXml,
    signedXml,
    ksefResponse:     invoice.ksef_response ?? null,
    audit: auditRecord
      ? {
          id:                 auditRecord.id,
          ksefNumber:         auditRecord.ksef_number,
          paymentMethodSent:  auditRecord.payment_method_sent,
          dueDateSent:        auditRecord.due_date_sent,
          xmlPayload:         auditRecord.xml_payload,
          attemptResult:      auditRecord.attempt_result,
          errorMessage:       auditRecord.error_message,
          createdAt:          auditRecord.created_at,
        }
      : null,
  });
}
