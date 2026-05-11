import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { vendorId: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const from        = searchParams.get('from')        ?? null;
    const to          = searchParams.get('to')          ?? null;
    const granularity = searchParams.get('granularity') ?? 'week';

    const { data, error } = await supabase.rpc('get_vendor_trend', {
      p_vendor_id:   params.vendorId,
      p_from:        from,
      p_to:          to,
      p_granularity: granularity,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ series: data ?? [] });
  } catch (err) {
    console.error('[api/vendors/[vendorId]/trend]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
