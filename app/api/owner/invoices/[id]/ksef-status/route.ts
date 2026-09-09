import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /api/owner/invoices/[id]/ksef-status
 *
 * Returns the current KSeF submission status for a platform invoice.
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice } = await (supabase as any)
    .from('platform_invoices')
    .select('ksef_status, ksef_number, ksef_submission_id, ksef_response, ksef_submitted_at, ksef_last_attempt_at')
    .eq('id', params.id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: 'Faktura nie znaleziona.' }, { status: 404 });
  }

  // Get latest submission job
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: latestJob } = await (supabase as any)
    .from('ksef_submission_jobs')
    .select('status, attempt_count, last_error, updated_at')
    .eq('invoice_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ksefStatus:       invoice.ksef_status ?? null,
    ksefNumber:       invoice.ksef_number ?? null,
    ksefSubmissionId: invoice.ksef_submission_id ?? null,
    ksefResponse:     invoice.ksef_response ?? null,
    submittedAt:      invoice.ksef_submitted_at ?? null,
    lastAttemptAt:    invoice.ksef_last_attempt_at ?? null,
    latestJob:        latestJob ?? null,
  });
}
