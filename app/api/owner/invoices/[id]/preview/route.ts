import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /api/owner/invoices/:id/preview
 *
 * Returns invoice metadata + line items + company info for HTML preview rendering.
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
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: 'Faktura nie znaleziona.' }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lineItems } = await (supabase as any)
    .from('platform_invoice_line_items')
    .select('*')
    .eq('invoice_id', params.id)
    .order('created_at');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('id, name, nip, city, street, zip')
    .eq('id', invoice.entity_id)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: audit } = await (supabase as any)
    .from('platform_invoice_audit')
    .select('*')
    .eq('invoice_id', params.id)
    .order('created_at');

  return NextResponse.json({
    invoice: {
      id:                invoice.id,
      invoiceNumber:     invoice.invoice_number,
      status:            invoice.status,
      periodStart:       invoice.period_start,
      periodEnd:         invoice.period_end,
      subtotalCents:     invoice.subtotal_cents,
      taxCents:          invoice.tax_cents,
      discountCents:     invoice.discount_cents,
      totalCents:        invoice.total_cents,
      currency:          invoice.currency,
      vatRatePercent:    invoice.vat_rate_percent,
      vatNumber:         invoice.vat_number,
      priceIncludesTax:  invoice.price_includes_tax,
      taxTotalCents:     invoice.tax_total_cents,
      taxBreakdown:      invoice.tax_breakdown,
      taxSnapshotTakenAt: invoice.tax_snapshot_taken_at,
      issuedAt:          invoice.issued_at,
      dueDate:           invoice.due_date,
      sentAt:            invoice.sent_at,
      notes:             invoice.notes,
      internalReference: invoice.internal_reference,
      createdAt:         invoice.created_at,
    },
    lineItems: (lineItems ?? []).map((li: { id: string; description: string; quantity: number; unit_price_cents: number; amount_cents: number; taxable: boolean; vat_rate_percent: number | null }) => ({
      id:             li.id,
      description:    li.description,
      quantity:       li.quantity,
      unitPriceCents: li.unit_price_cents,
      amountCents:    li.amount_cents,
      taxable:        li.taxable,
      vatRatePercent: li.vat_rate_percent,
    })),
    company: company ?? null,
    audit: (audit ?? []).map((a: { id: string; actor_id: string; action: string; reason: string | null; ip: string | null; created_at: string }) => ({
      id:        a.id,
      actorId:   a.actor_id,
      action:    a.action,
      reason:    a.reason,
      ip:        a.ip,
      createdAt: a.created_at,
    })),
  });
}
