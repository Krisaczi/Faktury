import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const LS_API_KEY   = process.env.LEMONSQUEEZY_API_KEY;
const LS_STORE_ID  = process.env.LEMONSQUEEZY_STORE_ID;
const LS_VARIANT_ID = process.env.LEMONSQUEEZY_VARIANT_ID;

export async function POST(req: NextRequest) {
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

    if (!['owner', 'admin'].includes(userRecord.role ?? '')) {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
    }

    if (!LS_API_KEY || !LS_STORE_ID || !LS_VARIANT_ID) {
      return NextResponse.json(
        { error: 'Billing not configured', code: 'LS_NOT_CONFIGURED' },
        { status: 422 }
      );
    }

    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', userRecord.company_id)
      .maybeSingle();

    // Create Lemon Squeezy checkout
    const lsRes = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        'Accept':        'application/vnd.api+json',
        'Content-Type':  'application/vnd.api+json',
        'Authorization': `Bearer ${LS_API_KEY}`,
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              email:      user.email,
              custom:     { company_id: userRecord.company_id },
              name:       company?.name ?? '',
            },
          },
          relationships: {
            store:   { data: { type: 'stores',   id: LS_STORE_ID } },
            variant: { data: { type: 'variants',  id: LS_VARIANT_ID } },
          },
        },
      }),
    });

    if (!lsRes.ok) {
      const errText = await lsRes.text();
      console.error('[billing/checkout] Lemon Squeezy error', lsRes.status, errText.slice(0, 200));
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 502 });
    }

    const lsData = await lsRes.json();
    const checkoutUrl: string = lsData?.data?.attributes?.url ?? '';

    await supabase.from('settings_audit').insert({
      company_id: userRecord.company_id,
      user_id:    user.id,
      action:     'billing_checkout_created',
      metadata:   { checkout_id: lsData?.data?.id },
    });

    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    console.error('[api/billing/checkout]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
