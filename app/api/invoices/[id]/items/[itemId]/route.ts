import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { InvoiceItemSchema } from '@/types/invoice-item';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userRecord } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['owner', 'accountant'].includes(userRecord.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden: insufficient role' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = InvoiceItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        error: 'Validation failed',
        fieldErrors: parsed.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('invoice_items')
      .select('id, raw_text, source, confidence, page_number, bbox')
      .eq('id', params.itemId)
      .eq('invoice_id', params.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const { data: updated, error } = await supabase
      .from('invoice_items')
      .update({
        description: parsed.data.description,
        quantity: parsed.data.quantity,
        unit: parsed.data.unit,
        unit_price: parsed.data.unit_price,
        net_amount: parsed.data.net_amount,
        vat_rate: parsed.data.vat_rate,
        vat_amount: parsed.data.vat_amount,
        gross_amount: parsed.data.gross_amount,
        source: 'manual',
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.itemId)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from('audit_logs').insert({
      company_id: userRecord.company_id,
      user_id: user.id,
      invoice_id: params.id,
      action: 'invoice_item_updated',
      metadata: {
        item_id: params.itemId,
        previous: existing,
      } as unknown as never,
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[api/invoices/[id]/items/[itemId] PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
