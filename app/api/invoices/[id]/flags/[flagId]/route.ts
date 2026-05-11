import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; flagId: string } }
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
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify invoice belongs to company
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('id', params.id)
      .eq('company_id', userRecord.company_id)
      .maybeSingle();

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const body = await req.json();
    const { status } = body as { status: 'acknowledged' | 'dismissed' | 'open' };

    if (!status || !['acknowledged', 'dismissed', 'open'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be acknowledged, dismissed, or open' },
        { status: 400 }
      );
    }

    type FlagUpdate = {
      status: 'open' | 'acknowledged' | 'dismissed';
      acknowledged_by?: string | null;
      acknowledged_at?: string | null;
    };
    const updatePayload: FlagUpdate = { status };
    if (status === 'acknowledged') {
      updatePayload.acknowledged_by = user.id;
      updatePayload.acknowledged_at = new Date().toISOString();
    } else if (status === 'open') {
      updatePayload.acknowledged_by = null;
      updatePayload.acknowledged_at = null;
    }

    const { data: flag, error } = await supabase
      .from('risk_flags')
      .update(updatePayload as never)
      .eq('id', params.flagId)
      .eq('invoice_id', params.id)
      .select('id, type, severity, message, status, acknowledged_by, acknowledged_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from('audit_logs').insert({
      company_id: userRecord.company_id,
      user_id: user.id,
      invoice_id: params.id,
      action: status === 'acknowledged' ? 'flag_acknowledged' : status === 'dismissed' ? 'flag_dismissed' : 'flag_reopened',
      metadata: { flag_id: params.flagId },
    });

    return NextResponse.json(flag);
  } catch (err) {
    console.error('[api/invoices/[id]/flags/[flagId] PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
