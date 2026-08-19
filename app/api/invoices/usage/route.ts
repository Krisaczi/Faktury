import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getMonthlyInvoiceUsage } from '@/lib/packages/invoice-limit';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const { data: u } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!u?.company_id) {
      return NextResponse.json({ error: 'No company' }, { status: 403 });
    }

    const usage = await getMonthlyInvoiceUsage(u.company_id);

    return NextResponse.json({
      issued:     usage.issued,
      limit:      usage.limit,
      remaining:  usage.remaining,
      override:   usage.overrideExtra,
      isLimited:  usage.limit !== null,
      atLimit:    usage.limit !== null && usage.remaining === 0,
      nearLimit:  usage.limit !== null && usage.remaining !== null && usage.remaining <= Math.max(1, Math.ceil(usage.limit * 0.2)),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
