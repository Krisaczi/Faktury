import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { InvoiceChargeSchema } from '@/types/invoice-charge';
import { requireInvoicingPackage } from '@/lib/packages/invoicing-guard';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: charges, error } = await supabase
      .from('invoice_charges')
      .select('*')
      .eq('invoice_id', params.id)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ charges: charges ?? [] });
  } catch (err) {
    console.error('[api/invoices/[id]/charges GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    if (!['owner', 'admin', 'accountant'].includes(userRecord.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden: insufficient role' }, { status: 403 });
    }

    // Block Starter packages from invoice mutations
    const invoicingForbidden = await requireInvoicingPackage(userRecord.company_id);
    if (invoicingForbidden) return invoicingForbidden;

    const body = await req.json();
    const parsed = InvoiceChargeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        error: 'Validation failed',
        fieldErrors: parsed.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, company_id')
      .eq('id', params.id)
      .eq('company_id', userRecord.company_id)
      .maybeSingle();

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const { data: created, error } = await supabase
      .from('invoice_charges')
      .insert({
        invoice_id: params.id,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
        source: 'manual',
        confidence: 1.0,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from('audit_logs').insert({
      company_id: userRecord.company_id,
      user_id: user.id,
      invoice_id: params.id,
      action: 'invoice_charge_added',
      metadata: { charge_id: created.id, amount: parsed.data.amount } as unknown as never,
    });

    return NextResponse.json(created);
  } catch (err) {
    console.error('[api/invoices/[id]/charges POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
