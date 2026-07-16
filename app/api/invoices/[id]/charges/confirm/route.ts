import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(
  _req: NextRequest,
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

    if (!['owner', 'admin'].includes(userRecord.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden: only owners and admins can confirm charges' }, { status: 403 });
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

    const { error: updateError } = await supabase
      .from('invoice_charges')
      .update({
        confirmed: true,
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('invoice_id', params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await supabase.from('audit_logs').insert({
      company_id: userRecord.company_id,
      user_id: user.id,
      invoice_id: params.id,
      action: 'invoice_charges_confirmed',
      metadata: {} as never,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/invoices/[id]/charges/confirm]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
