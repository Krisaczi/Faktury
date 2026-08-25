import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { computeTax, validateVatRate } from '@/lib/tax-calc';

const LineItemSchema = z.object({
  description:      z.string().min(1).max(500),
  quantity:         z.number().min(0.01).max(10000),
  unitPriceCents:   z.number().int().min(0),
  taxable:          z.boolean().optional().default(true),
  vatRate:          z.number().min(0).max(100).optional(),
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
  vatRate:          z.number().min(0).max(100).optional(),
  vatMode:          z.enum(['invoice', 'per_line']).optional().default('invoice'),
  priceIncludesTax: z.boolean().optional().default(false),
  vatNumber:        z.string().max(30).optional(),
});

/**
 * POST /api/owner/invoices/draft
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

  const {
    entityId, entityType, periodYear, periodMonth, lineItems,
    notes, internalReference, dueDate,
    vatRate, vatMode, priceIncludesTax, vatNumber,
  } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('id, name, product_type, is_active')
    .eq('id', entityId)
    .maybeSingle();

  if (!company) return NextResponse.json({ error: 'Firma nie istnieje.' }, { status: 404 });
  if (company.is_active === false) return NextResponse.json({ error: 'Firma jest nieaktywna.' }, { status: 400 });

  const invoiceVatRate = validateVatRate(vatRate ?? 0);
  const usePerLineVat = vatMode === 'per_line';

  const taxResult = computeTax(
    lineItems.map((li) => ({
      description:      li.description,
      quantity:         li.quantity,
      unitPriceCents:   li.unitPriceCents,
      taxable:          li.taxable,
      vatRatePercent:   usePerLineVat ? (li.vatRate ?? invoiceVatRate) : invoiceVatRate,
    })),
    invoiceVatRate,
    priceIncludesTax,
  );

  const periodStart = new Date(periodYear, periodMonth - 1, 1);
  const periodEnd = new Date(periodYear, periodMonth, 0);

  const taxBreakdown = {
    vatRatePercent:   taxResult.vatRatePercent,
    priceIncludesTax: taxResult.priceIncludesTax,
    lines:            taxResult.lineItems.map((li) => ({
      description:    li.description,
      quantity:       li.quantity,
      unitPriceCents: li.unitPriceCents,
      amountCents:    li.amountCents,
      taxable:        li.taxable,
      vatRatePercent: li.vatRatePercent,
      taxBaseCents:   li.taxBaseCents,
      taxAmountCents: li.taxAmountCents,
    })),
    breakdown: taxResult.breakdown,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice, error: invErr } = await (supabase as any)
    .from('platform_invoices')
    .insert({
      entity_id:             entityId,
      entity_type:           entityType,
      period_start:          periodStart.toISOString().split('T')[0],
      period_end:            periodEnd.toISOString().split('T')[0],
      subtotal_cents:        taxResult.subtotalCents,
      tax_cents:             taxResult.taxTotalCents,
      discount_cents:        0,
      total_cents:           taxResult.totalCents,
      currency:              'PLN',
      status:                'draft',
      notes:                 notes ?? null,
      internal_reference:    internalReference ?? null,
      due_date:              dueDate ?? null,
      metadata:              { plan: company.product_type ?? 'starter' },
      vat_rate_percent:      invoiceVatRate,
      vat_number:            vatNumber ?? null,
      price_includes_tax:    priceIncludesTax,
      tax_total_cents:       taxResult.taxTotalCents,
      tax_breakdown:         taxBreakdown,
    })
    .select('id')
    .single();

  if (invErr) {
    console.error('[draft] insert error', invErr);
    return NextResponse.json({ error: 'Błąd tworzenia faktury.' }, { status: 500 });
  }

  const itemsToInsert = taxResult.lineItems.map((li) => ({
    invoice_id:       invoice.id,
    description:      li.description,
    quantity:         li.quantity,
    unit_price_cents: li.unitPriceCents,
    amount_cents:     li.amountCents,
    taxable:          li.taxable,
    vat_rate_percent: usePerLineVat ? li.vatRatePercent : null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: itemsErr } = await (supabase as any)
    .from('platform_invoice_line_items')
    .insert(itemsToInsert);

  if (itemsErr) {
    console.error('[draft] line items error', itemsErr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('platform_invoices').delete().eq('id', invoice.id);
    return NextResponse.json({ error: 'Błąd pozycji faktury.' }, { status: 500 });
  }

  const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('platform_invoice_audit').insert({
    invoice_id: invoice.id,
    actor_id:   user.id,
    action:     'created',
    ip:         ownerIp,
    payload:    {
      lineItemCount:   taxResult.lineItems.length,
      subtotalCents:   taxResult.subtotalCents,
      taxCents:        taxResult.taxTotalCents,
      totalCents:      taxResult.totalCents,
      vatRatePercent:  invoiceVatRate,
      priceIncludesTax,
      vatNumber:       vatNumber ?? null,
    },
  });

  if (vatNumber) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('platform_invoice_audit').insert({
      invoice_id: invoice.id,
      actor_id:   user.id,
      action:     'vat_number_set',
      ip:         ownerIp,
      payload:    { vatNumber },
    });
  }

  return NextResponse.json({
    id:             invoice.id,
    status:         'draft',
    subtotalCents:  taxResult.subtotalCents,
    taxCents:       taxResult.taxTotalCents,
    totalCents:     taxResult.totalCents,
    taxBreakdown:   taxResult.breakdown,
    lineItemCount:  taxResult.lineItems.length,
  });
}
