import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const LineItemSchema = z.object({
  description:      z.string().min(1).max(500),
  quantity:         z.number().min(0.01).max(10000),
  unitPriceCents:   z.number().int().min(0),
  taxable:          z.boolean().optional().default(true),
});

const DraftSchema = z.object({
  entityId:         z.string().uuid(),
  entityType:       z.string().optional().default('company'),
  periodYear:       z.number().int().min(2020).max(2100),
  periodMonth:      z.number().int().min(1).max(12),
  lineItems:        z.array(LineItemSchema).min(1),
  notes:            z.string().max(2000).optional(),
  internalReference: z.string().max(200).optional(),
  dueDate:          z.string().optional(),
});

const TAX_RATE = 0.23; // 23% Polish VAT

/**
 * POST /api/owner/invoices/draft
 *
 * Creates a platform invoice draft. Server computes all totals.
 * Invoice number is NOT assigned until issue.
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

  const body = await req.json().catch(() => ({}));
  const parsed = DraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Błąd walidacji', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { entityId, entityType, periodYear, periodMonth, lineItems, notes, internalReference, dueDate } = parsed.data;

  // Validate entity exists — owner RLS policy allows cross-company reads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('id, name, product_type, is_active')
    .eq('id', entityId)
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ error: 'Firma nie istnieje.' }, { status: 404 });
  }
  if (company.is_active === false) {
    return NextResponse.json({ error: 'Firma jest nieaktywna.' }, { status: 400 });
  }

  // Compute totals server-side
  let subtotalCents = 0;
  let taxCents = 0;

  const computedItems = lineItems.map((item) => {
    const amountCents = Math.round(item.quantity * item.unitPriceCents);
    subtotalCents += amountCents;
    if (item.taxable) {
      taxCents += Math.round(amountCents * TAX_RATE);
    }
    return {
      description:      item.description,
      quantity:         item.quantity,
      unit_price_cents: item.unitPriceCents,
      amount_cents:     amountCents,
      taxable:          item.taxable,
    };
  });

  const totalCents = subtotalCents + taxCents;

  const periodStart = new Date(periodYear, periodMonth - 1, 1);
  const periodEnd = new Date(periodYear, periodMonth, 0);

  // Insert invoice (draft, no invoice_number yet)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice, error: invErr } = await (supabase as any)
    .from('platform_invoices')
    .insert({
      entity_id:          entityId,
      entity_type:        entityType,
      period_start:       periodStart.toISOString().split('T')[0],
      period_end:         periodEnd.toISOString().split('T')[0],
      subtotal_cents:     subtotalCents,
      tax_cents:          taxCents,
      discount_cents:     0,
      total_cents:        totalCents,
      currency:           'PLN',
      status:             'draft',
      notes:              notes ?? null,
      internal_reference: internalReference ?? null,
      due_date:           dueDate ?? null,
      metadata:           { plan: company.product_type ?? 'starter' },
    })
    .select('id')
    .single();

  if (invErr) {
    console.error('[draft] insert error', invErr);
    return NextResponse.json({ error: 'Błąd tworzenia faktury.' }, { status: 500 });
  }

  // Insert line items
  const itemsToInsert = computedItems.map((item) => ({
    ...item,
    invoice_id: invoice.id,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: itemsErr } = await (supabase as any)
    .from('platform_invoice_line_items')
    .insert(itemsToInsert);

  if (itemsErr) {
    console.error('[draft] line items error', itemsErr);
    // Clean up the invoice
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('platform_invoices').delete().eq('id', invoice.id);
    return NextResponse.json({ error: 'Błąd pozycji faktury.' }, { status: 500 });
  }

  // Audit: created
  const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('platform_invoice_audit').insert({
    invoice_id: invoice.id,
    actor_id:   user.id,
    action:     'created',
    ip:         ownerIp,
    payload:    { lineItemCount: computedItems.length, subtotalCents, taxCents, totalCents },
  });

  return NextResponse.json({
    id:           invoice.id,
    status:       'draft',
    subtotalCents,
    taxCents,
    totalCents,
    lineItemCount: computedItems.length,
  });
}
