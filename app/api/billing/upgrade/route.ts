import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userRow } = await (supabase as any)
      .from('users')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRow?.company_id) {
      return NextResponse.json({ error: 'No company found', code: 'COMPANY_ID_MISSING' }, { status: 400 });
    }

    if (userRow.role !== 'owner' && userRow.role !== 'accountant') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    // Check current plan
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: company } = await (supabase as any)
      .from('companies')
      .select('product_type')
      .eq('id', userRow.company_id)
      .maybeSingle();

    const currentPlan = company?.product_type ?? 'starter';

    if (currentPlan === 'professional') {
      return NextResponse.json({ error: 'Already on Professional', code: 'ALREADY_PROFESSIONAL' }, { status: 409 });
    }

    // Upgrade: set product_type to professional + upsert plan_assignments
    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase as any)
      .from('companies')
      .update({
        product_type:        'professional',
        package_type:        'professional',
        package_assigned_at: now,
        updated_at:          now,
      })
      .eq('id', userRow.company_id);

    if (updateErr) {
      console.error('[api/billing/upgrade] update error', updateErr);
      return NextResponse.json({ error: 'Database error', code: 'DB_ERROR' }, { status: 500 });
    }

    // Upsert plan_assignments (canonical source)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('plan_assignments')
      .upsert({
        entity_id:      userRow.company_id,
        entity_type:    'company',
        plan_id:        'professional',
        status:         'active',
        effective_from: now,
        updated_at:     now,
        metadata:       { source: 'self_serve' },
      }, { onConflict: 'entity_id,entity_type' })
      .eq('status', 'active');

    // Audit log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('billing_audit').insert({
      company_id:  userRow.company_id,
      actor_id:    user.id,
      old_package: currentPlan,
      new_package: 'professional',
      provider:    'local',
      event_type:  'plan_changed',
      from_plan:   currentPlan,
      to_plan:     'professional',
      changed_by:  user.id,
      metadata:    { source: 'self_serve' },
    });

    return NextResponse.json({
      product_type: 'professional',
      message: 'Plan upgraded to Professional',
    });
  } catch (err) {
    console.error('[api/billing/upgrade]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
