import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
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
      return NextResponse.json({ error: 'Company not found' }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const from       = sp.get('from')       ?? undefined;
    const to         = sp.get('to')         ?? undefined;
    const vendorId   = sp.get('vendorId')   ?? undefined;
    const riskLevel  = sp.get('riskLevel')  ?? undefined;
    const search     = sp.get('search')     ?? undefined;
    const page       = Math.max(1, parseInt(sp.get('page')     ?? '1',  10));
    const pageSize   = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '20', 10)));
    const sortBy     = sp.get('sortBy')  === 'amount' ? 'amount' : 'issue_date';
    const sortDir    = sp.get('sortDir') === 'asc'    ? 'asc'    : 'desc';

    const { data, error } = await supabase.rpc('get_risk_report_page', {
      p_from:       from       ?? null,
      p_to:         to         ?? null,
      p_vendor_id:  vendorId   ?? null,
      p_risk_level: riskLevel  ?? null,
      p_search:     search     ?? null,
      p_page:       page,
      p_page_size:  pageSize,
      p_sort_by:    sortBy,
      p_sort_dir:   sortDir,
    });

    if (error) {
      console.error('[api/reports/risk]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      rows:               result?.rows               ?? [],
      totalCount:         Number(result?.total_count          ?? 0),
      highRiskCount:      Number(result?.high_risk_count      ?? 0),
      totalFlaggedAmount: Number(result?.total_flagged_amount ?? 0),
      page,
      pageSize,
    });
  } catch (err) {
    console.error('[api/reports/risk]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
