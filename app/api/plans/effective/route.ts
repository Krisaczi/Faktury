import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePlanByCompanyId } from '@/lib/plans/canonical-plan';

/**
 * GET /api/plans/effective?entityId=<companyId>
 *
 * Returns the canonical effective plan for a company.
 * This is the single API that all frontend pages should call for plan display.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entityId = req.nextUrl.searchParams.get('entityId');

    // If no entityId provided, resolve from the authenticated user's company
    let companyId = entityId;

    if (!companyId) {
      const { data: userRow } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!userRow?.company_id) {
        return NextResponse.json({ error: 'No company found' }, { status: 404 });
      }
      companyId = userRow.company_id;
    }

    // Verify the user has access to this company (membership check)
    if (entityId && entityId !== companyId) {
      const { data: userRow } = await supabase
        .from('users')
        .select('company_id, role')
        .eq('id', user.id)
        .maybeSingle();

      // Owner can query any company; others can only query their own
      if (userRow?.role !== 'owner' && userRow?.company_id !== entityId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const effectivePlan = await getEffectivePlanByCompanyId(companyId);

    return NextResponse.json({
      planId:       effectivePlan.planId,
      planName:     effectivePlan.planName,
      planLabel:    effectivePlan.planLabel,
      monthlyPrice: effectivePlan.monthlyPrice,
      source:       effectivePlan.source,
      companyId:    effectivePlan.companyId,
      limits:       effectivePlan.limits,
      assignedAt:   effectivePlan.assignedAt,
      updatedAt:    effectivePlan.updatedAt,
      isKnownPlan:  effectivePlan.planId === 'starter' || effectivePlan.planId === 'professional',
    });
  } catch (err) {
    console.error('[api/plans/effective]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
