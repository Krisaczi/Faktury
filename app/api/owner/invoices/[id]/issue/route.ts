import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * POST /api/owner/invoices/:id/issue
 *
 * Finalizes a draft invoice: assigns invoice number, sets status=issued,
 * persists immutable tax snapshot, records issuedBy/issuedAt/dueDate.
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
    .select('id, status, entity_id, vat_rate_percent, tax_breakdown, tax_total_cents, price_includes_tax')
    .eq('id', params.id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: 'Faktura nie znaleziona.' }, { status: 404 });
  }

  if (invoice.status !== 'draft') {
    return NextResponse.json({ error: 'Faktura nie jest szkicem.' }, { status: 400 });
  }

  // Generate invoice number via RPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoiceNumber, error: numErr } = await (supabase as any)
    .rpc('generate_platform_invoice_number');

  if (numErr || !invoiceNumber) {
    console.error('[issue] number generation error', numErr);
    return NextResponse.json({ error: 'Błąd generowania numeru faktury.' }, { status: 500 });
  }

  const now = new Date();
  const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString();

  // Persist immutable tax snapshot
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (supabase as any)
    .from('platform_invoices')
    .update({
      invoice_number:         invoiceNumber,
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

  return NextResponse.json({
    ok:            true,
    invoiceNumber,
    status:        'issued',
    issuedAt:      nowIso,
    dueDate:       dueDate.toISOString().split('T')[0],
    taxSnapshot: {
      vatRatePercent:   invoice.vat_rate_percent,
      taxTotalCents:    invoice.tax_total_cents,
      taxBreakdown:     invoice.tax_breakdown,
    },
  });
}
