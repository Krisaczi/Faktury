import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function POST() {
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
      return NextResponse.json({ error: 'No company found' }, { status: 404 });
    }

    if (!['owner'].includes(userRecord.role ?? '')) {
      return NextResponse.json({ error: 'Owner role required' }, { status: 403 });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('product_type, package_type')
      .eq('id', userRecord.company_id)
      .maybeSingle();

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const currentType = (company.product_type ?? company.package_type ?? 'starter') as string;

    if (currentType === 'professional') {
      return NextResponse.json({ error: 'Already on Professional plan' }, { status: 409 });
    }

    if (currentType !== 'starter') {
      return NextResponse.json({ error: 'Cannot upgrade from current plan' }, { status: 422 });
    }

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('companies')
      .update({
        product_type: 'professional',
        package_type: 'professional',
        subscription_status: 'active',
        updated_at: now,
      })
      .eq('id', userRecord.company_id);

    if (updateError) {
      console.error('[billing/upgrade] update error', updateError);
      return NextResponse.json({ error: 'Failed to upgrade plan' }, { status: 500 });
    }

    await supabase.from('company_package_audit').insert({
      company_id: userRecord.company_id,
      changed_by: user.id,
      previous: { product_type: 'starter', package_type: currentType },
      next: { product_type: 'professional', package_type: 'professional' },
      reason: 'upgrade_plan',
    });

    return NextResponse.json({
      product_type: 'professional',
      message: 'Plan upgraded to Professional',
    });
  } catch (err) {
    console.error('[api/billing/upgrade]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
