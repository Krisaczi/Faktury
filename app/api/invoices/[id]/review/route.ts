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
    const { status = 'reviewed', note } = body as {
      status?: 'reviewed' | 'approved' | 'flagged_for_follow_up';
      note?: string;
    };

    if (!['reviewed', 'approved', 'flagged_for_follow_up'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const { data: review, error } = await supabase
      .from('invoice_reviews')
      .insert({
        invoice_id: params.id,
        reviewer_id: user.id,
        status,
        note: note ?? null,
      })
      .select('id, status, note, reviewer_id, created_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from('audit_logs').insert({
      company_id: userRecord.company_id,
      user_id: user.id,
      invoice_id: params.id,
      action: 'invoice_reviewed',
      metadata: { review_id: review.id, status, has_note: !!note },
    });

    return NextResponse.json(review, { status: 201 });
  } catch (err) {
    console.error('[api/invoices/[id]/review POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
