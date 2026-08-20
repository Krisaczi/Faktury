import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getPlanLimits } from '@/lib/plans/plan-limits';

// GET /api/plans/:planId/limits
export async function GET(
  _req: NextRequest,
  { params }: { params: { planId: string } },
) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const planId = params.planId;
  if (!planId || !['starter', 'professional'].includes(planId)) {
    return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
  }

  const limits = await getPlanLimits(planId);
  return NextResponse.json(limits);
}
