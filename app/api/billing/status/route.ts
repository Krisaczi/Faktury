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

    const { data: company } = await supabase
      .from('companies')
      .select('product_type, subscription_status')
      .eq('id', userRecord.company_id)
      .maybeSingle();

    const { data: auditHistory } = await supabase
      .from('billing_audit')
      .select('*')
      .eq('company_id', userRecord.company_id)
      .order('created_at', { ascending: false })
      .limit(10);

    const productType = (company?.product_type as 'starter' | 'professional' | null) ?? 'starter';
    const subscriptionStatus = company?.subscription_status ?? 'active';

    return NextResponse.json({
      product_type: productType,
      subscription_status: subscriptionStatus,
      auditHistory: auditHistory ?? [],
      canUpgrade: productType === 'starter',
    });
  } catch (err) {
    console.error('[api/billing/status]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
