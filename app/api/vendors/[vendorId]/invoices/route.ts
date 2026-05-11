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
    const page     = parseInt(searchParams.get('page')     ?? '1',  10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);
    const from      = searchParams.get('from')      ?? null;
    const to        = searchParams.get('to')        ?? null;
    const riskLevel = searchParams.get('riskLevel') ?? null;
    const search    = searchParams.get('search')    ?? null;
    const sortBy    = searchParams.get('sortBy')    ?? 'issue_date';
    const sortDir   = searchParams.get('sortDir')   ?? 'desc';

    const { data, error } = await supabase.rpc('get_vendor_invoices_page', {
      p_vendor_id:  params.vendorId,
      p_from:       from,
      p_to:         to,
      p_risk_level: riskLevel,
      p_search:     search,
      p_page:       page,
      p_page_size:  pageSize,
      p_sort_by:    sortBy,
      p_sort_dir:   sortDir,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = Array.isArray(data) ? data[0] : data;
    const rawRows = result?.rows;
    const rows = Array.isArray(rawRows) ? rawRows as Record<string, unknown>[] : [];

    return NextResponse.json({
      rows,
      totalCount: result?.total_count ?? 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('[api/vendors/[vendorId]/invoices]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
