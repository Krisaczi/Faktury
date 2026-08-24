import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /api/owner/invoices?entityId=&period=&status=
 *
 * Lists platform invoices with optional filters. Owner-only.
 * Supports pagination via ?page=&limit=.
 */
export async function GET(req: NextRequest) {
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

  const entityId = req.nextUrl.searchParams.get('entityId');
  const period   = req.nextUrl.searchParams.get('period');   // YYYY-MM
  const status   = req.nextUrl.searchParams.get('status');   // draft|issued|sent|paid|revoked
  const page     = Number(req.nextUrl.searchParams.get('page') ?? '1');
  const limit    = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '50'), 200);
  const offset   = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('platform_invoices')
    .select(`
      id, invoice_number, entity_id, status, period_start, period_end,
      subtotal_cents, tax_cents, total_cents, currency,
      issued_at, due_date, sent_at, notes, internal_reference, created_at,
      companies:entity_id ( name )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (entityId) query = query.eq('entity_id', entityId);
  if (status)   query = query.eq('status', status);
  if (period) {
    const [y, m] = period.split('-');
    const periodStart = new Date(Number(y), Number(m) - 1, 1);
    const periodEnd = new Date(Number(y), Number(m), 0);
    query = query.gte('period_start', periodStart.toISOString().split('T')[0]);
    query = query.lte('period_end', periodEnd.toISOString().split('T')[0]);
  }

  const { data: invoices, count, error } = await query;

  if (error) {
    console.error('[list] error', error);
    return NextResponse.json({ error: 'Błąd ładowania faktur.' }, { status: 500 });
  }

  return NextResponse.json({
    invoices: (invoices ?? []).map((inv: {
      id: string; invoice_number: string | null; entity_id: string; status: string;
      period_start: string; period_end: string; subtotal_cents: number; tax_cents: number;
      total_cents: number; currency: string; issued_at: string | null; due_date: string | null;
      sent_at: string | null; notes: string | null; internal_reference: string | null;
      created_at: string; companies: { name: string } | { name: string }[] | null;
    }) => ({
      id:                inv.id,
      invoiceNumber:     inv.invoice_number,
      entityId:          inv.entity_id,
      status:            inv.status,
      periodStart:       inv.period_start,
      periodEnd:         inv.period_end,
      subtotalCents:     inv.subtotal_cents,
      taxCents:          inv.tax_cents,
      totalCents:        inv.total_cents,
      currency:          inv.currency,
      issuedAt:          inv.issued_at,
      dueDate:           inv.due_date,
      sentAt:            inv.sent_at,
      notes:             inv.notes,
      internalReference: inv.internal_reference,
      createdAt:         inv.created_at,
      companyName:       Array.isArray(inv.companies) ? inv.companies[0]?.name : inv.companies?.name,
      companyEmail:      null,
    })),
    total:   count ?? 0,
    page,
    limit,
  });
}
