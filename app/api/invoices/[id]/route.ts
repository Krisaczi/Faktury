import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase.rpc('get_invoice_detail', {
      p_invoice_id: params.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row?.invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Log view action
    const { data: userRecord } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (userRecord?.company_id) {
      await supabase.from('audit_logs').insert({
        company_id: userRecord.company_id,
        user_id: user.id,
        invoice_id: params.id,
        action: 'invoice_view',
        metadata: {},
      });
    }

    return NextResponse.json(row);
  } catch (err) {
    console.error('[api/invoices/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userRecord } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['owner', 'admin'].includes(userRecord.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden: only admins and owners can delete invoices' }, { status: 403 });
    }

    // Verify the invoice belongs to this company before deleting
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, invoice_number, company_id')
      .eq('id', params.id)
      .eq('company_id', userRecord.company_id)
      .maybeSingle();

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Audit log before deletion (so we keep the record)
    await supabase.from('audit_logs').insert({
      company_id: userRecord.company_id,
      user_id: user.id,
      invoice_id: params.id,
      action: 'invoice_deleted',
      metadata: { invoice_number: invoice.invoice_number },
    });

    const { error: deleteError } = await supabase
      .from('invoices')
      .delete()
      .eq('id', params.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/invoices/[id] DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
