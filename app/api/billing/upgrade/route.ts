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

    const { error } = await supabase.rpc('self_serve_upgrade');

    if (error) {
      const message = error.message ?? '';
      if (message.includes('ALREADY_PROFESSIONAL')) {
        return NextResponse.json({ error: 'Already on Professional', code: 'ALREADY_PROFESSIONAL' }, { status: 409 });
      }
      if (message.includes('COMPANY_ID_MISSING')) {
        return NextResponse.json({ error: 'No company found', code: 'COMPANY_ID_MISSING' }, { status: 400 });
      }
      if (message.includes('FORBIDDEN')) {
        return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
      }
      console.error('[api/billing/upgrade] rpc error', error);
      return NextResponse.json({ error: 'Database error', code: 'DB_ERROR' }, { status: 500 });
    }

    return NextResponse.json({
      product_type: 'professional',
      message: 'Plan upgraded to Professional',
    });
  } catch (err) {
    console.error('[api/billing/upgrade]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
