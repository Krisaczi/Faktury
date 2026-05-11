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

    const { data, error } = await supabase.rpc('get_risk_report_filters');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      vendors:    result?.vendors     ?? [],
      riskLevels: result?.risk_levels ?? [],
    });
  } catch (err) {
    console.error('[api/reports/risk/filters]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
