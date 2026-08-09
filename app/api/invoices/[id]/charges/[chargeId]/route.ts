import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { InvoiceChargeSchema } from '@/types/invoice-charge';
import { requireInvoicingPackage } from '@/lib/packages/invoicing-guard';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; chargeId: string } }
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

    const { data: existing } = await supabase
      .from('invoice_charges')
      .select('id, amount, reason, source, confidence')
      .eq('id', params.chargeId)
      .eq('invoice_id', params.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Charge not found' }, { status: 404 });
    }

    const { data: updated, error } = await supabase
      .from('invoice_charges')
      .update({
        amount: parsed.data.amount,
        reason: parsed.data.reason,
        source: 'manual',
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.chargeId)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from('audit_logs').insert({
      company_id: userRecord.company_id,
      user_id: user.id,
      invoice_id: params.id,
      action: 'invoice_charge_updated',
      metadata: {
        charge_id: params.chargeId,
        previous: existing,
      } as unknown as never,
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[api/invoices/[id]/charges/[chargeId] PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; chargeId: string } }
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

    if (!['owner', 'admin'].includes(userRecord.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden: only owners and admins can delete charges' }, { status: 403 });
    }

    // Block Starter packages from invoice mutations
    const invoicingForbidden = await requireInvoicingPackage(userRecord.company_id);
    if (invoicingForbidden) return invoicingForbidden;

    const { error } = await supabase
      .from('invoice_charges')
      .delete()
      .eq('id', params.chargeId)
      .eq('invoice_id', params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from('audit_logs').insert({
      company_id: userRecord.company_id,
      user_id: user.id,
      invoice_id: params.id,
      action: 'invoice_charge_deleted',
      metadata: { charge_id: params.chargeId } as unknown as never,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/invoices/[id]/charges/[chargeId] DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
