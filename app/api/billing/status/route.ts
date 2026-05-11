import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
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
      return NextResponse.json({ error: 'No company found' }, { status: 404 });
    }

    const { data: billing } = await supabase
      .from('billing_metadata')
      .select('plan_name, status, renews_at, ends_at, ls_subscription_id')
      .eq('company_id', userRecord.company_id)
      .maybeSingle();

    return NextResponse.json({
      billing: billing ?? {
        plan_name: 'Trial',
        status: 'trial',
        renews_at: null,
        ends_at: null,
        ls_subscription_id: null,
      },
      lsConfigured: !!process.env.LEMONSQUEEZY_API_KEY,
    });
  } catch (err) {
    console.error('[api/billing/status]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
