import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(
  req: NextRequest,
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
    const { type, severity, message } = body as {
      type: string;
      severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
      message: string;
    };

    if (!type || !severity || !message) {
      return NextResponse.json({ error: 'type, severity, and message are required' }, { status: 400 });
    }

    const { data: flag, error } = await supabase
      .from('risk_flags')
      .insert({
        invoice_id: params.id,
        type,
        severity,
        message,
      })
      .select('id, type, severity, message, status, created_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from('audit_logs').insert({
      company_id: userRecord.company_id,
      user_id: user.id,
      invoice_id: params.id,
      action: 'flag_created',
      metadata: { flag_id: flag.id, type, severity },
    });

    return NextResponse.json(flag, { status: 201 });
  } catch (err) {
    console.error('[api/invoices/[id]/flags POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
