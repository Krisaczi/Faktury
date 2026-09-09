import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /api/owner/invoices/ksef-health
 *
 * Returns KSeF submission health metrics for the owner dashboard widget.
 * Lists invoices with ksef_status in queued, failed, or rejected states.
 */
export async function GET(_req: NextRequest) {
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

  // Count invoices by KSeF status
  const statuses = ['queued', 'failed', 'rejected', 'submitted', 'accepted'];
  const counts: Record<string, number> = {};

  for (const status of statuses) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from('platform_invoices')
      .select('*', { count: 'exact', head: true })
      .eq('ksef_status', status)
      .neq('status', 'draft');
    counts[status] = count ?? 0;
  }

  // Get invoices needing attention (queued, failed, rejected)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: attentionInvoices } = await (supabase as any)
    .from('platform_invoices')
    .select('id, invoice_number, ksef_status, ksef_number, ksef_last_attempt_at, entity_id, total_cents')
    .in('ksef_status', ['queued', 'failed', 'rejected'])
    .neq('status', 'draft')
    .order('ksef_last_attempt_at', { ascending: false })
    .limit(20);

  // Get company names
  const companyIds = Array.from(new Set((attentionInvoices ?? []).map((inv: { entity_id: string }) => inv.entity_id)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: companies } = await (supabase as any)
    .from('companies')
    .select('id, name')
    .in('id', companyIds);
  const companyMap = new Map((companies ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));

  // Get queue length (pending submission jobs)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: queueLength } = await (supabase as any)
    .from('ksef_submission_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'queued');

  // Recent audit entries (last 10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recentAudit } = await (supabase as any)
    .from('ksef_submission_audit')
    .select('id, invoice_id, attempt_result, error_message, correlation_id, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({
    counts: {
      queued:    counts.queued ?? 0,
      failed:    counts.failed ?? 0,
      rejected:  counts.rejected ?? 0,
      submitted: counts.submitted ?? 0,
      accepted:  counts.accepted ?? 0,
    },
    queueLength: queueLength ?? 0,
    attentionInvoices: (attentionInvoices ?? []).map((inv: {
      id: string; invoice_number: string | null; ksef_status: string;
      ksef_number: string | null; ksef_last_attempt_at: string | null;
      entity_id: string; total_cents: number;
    }) => ({
      id:              inv.id,
      invoiceNumber:   inv.invoice_number,
      ksefStatus:      inv.ksef_status,
      ksefNumber:      inv.ksef_number,
      lastAttemptAt:   inv.ksef_last_attempt_at,
      companyName:     companyMap.get(inv.entity_id) ?? null,
      totalCents:      inv.total_cents,
    })),
    recentAudit: (recentAudit ?? []).map((a: {
      id: string; invoice_id: string; attempt_result: string;
      error_message: string | null; correlation_id: string | null; created_at: string;
    }) => ({
      id:             a.id,
      invoiceId:      a.invoice_id,
      attemptResult:  a.attempt_result,
      errorMessage:   a.error_message,
      correlationId:  a.correlation_id,
      createdAt:      a.created_at,
    })),
  });
}
