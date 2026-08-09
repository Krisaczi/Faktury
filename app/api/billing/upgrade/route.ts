import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { getSupabaseServerClient } from '@/lib/supabase/server';

function getAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST() {
  try {
    const admin = getAdminClient();
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

    if (!['owner', 'accountant'].includes(userRecord.role ?? '')) {
      return NextResponse.json({ error: 'Owner or accountant role required' }, { status: 403 });
    }

    // Read the current package
    const { data: company } = await admin
      .from('companies')
      .select('product_type, package_type')
      .eq('id', userRecord.company_id)
      .maybeSingle();

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const currentType = (company.product_type ?? 'starter') as string;

    if (currentType === 'professional') {
      return NextResponse.json({ error: 'Already on Professional plan' }, { status: 409 });
    }

    if (currentType !== 'starter') {
      return NextResponse.json({ error: 'Cannot upgrade from current plan' }, { status: 422 });
    }

    const nowIso = new Date().toISOString();

    // Upgrade the company using the admin (service role) client
    const { error: upgradeError } = await admin
      .from('companies')
      .update({
        product_type: 'professional',
        package_type: 'professional',
        subscription_status: 'active',
        package_changed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', userRecord.company_id);

    if (upgradeError) {
      console.error('[billing/upgrade] update error', upgradeError);
      return NextResponse.json({ error: 'Failed to upgrade plan' }, { status: 500 });
    }

    // Audit log in billing_audit
    await admin.from('billing_audit').insert({
      company_id: userRecord.company_id,
      actor_id: user.id,
      old_package: 'starter',
      new_package: 'professional',
      provider: 'internal',
      provider_tx_id: null,
      created_at: nowIso,
    });

    // Audit log in company_package_audit
    await admin.from('company_package_audit').insert({
      company_id: userRecord.company_id,
      changed_by: user.id,
      previous: { product_type: 'starter', package_type: company.package_type ?? 'starter' },
      next: { product_type: 'professional', package_type: 'professional' },
      reason: 'self_serve_upgrade',
      created_at: nowIso,
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
