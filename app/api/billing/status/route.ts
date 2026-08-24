import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePlan } from '@/lib/plans/canonical-plan';

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

    const effectivePlan = await getEffectivePlan(user.id);

    const { data: auditHistory } = await supabase
      .from('billing_audit')
      .select('*')
      .eq('company_id', userRecord.company_id)
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      product_type: effectivePlan.planId as 'starter' | 'professional',
      plan_source: effectivePlan.source,
      auditHistory: auditHistory ?? [],
      canUpgrade: effectivePlan.planId === 'starter',
    });
  } catch (err) {
    console.error('[api/billing/status]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
