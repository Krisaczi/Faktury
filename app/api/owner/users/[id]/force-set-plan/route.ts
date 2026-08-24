import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { forceSetPlan } from '@/lib/plans/reconciliation';
import { getPlanById } from '@/lib/plans/actions';

const ForceSetPlanSchema = z.object({
  planId:        z.string().min(1),
  effectiveFrom: z.string().datetime().optional(),
  reason:        z.string().max(500).optional(),
});

// POST /api/owner/users/[id]/force-set-plan
// Body: { planId, effectiveFrom?, reason? }

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: u } = await (supabase as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (u?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden — tylko właściciel' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = ForceSetPlanSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Błąd walidacji', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { planId, effectiveFrom, reason } = parsed.data;

  // Validate plan exists
  const plan = getPlanById(planId);
  if (!plan || !plan.active) {
    return NextResponse.json({ error: 'Nieprawidłowy plan.' }, { status: 400 });
  }

  const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;

  const result = await forceSetPlan(user.id, params.id, planId, ownerIp, {
    reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Błąd ustawiania planu.' }, { status: 500 });
  }

  return NextResponse.json({
    ok:      true,
    userId:  result.userId,
    fromPlan: result.fromPlan,
    toPlan:   result.toPlan,
    auditId:  result.auditId,
    message:  `Plan ustawiony na ${result.toPlan} (było: ${result.fromPlan}).`,
  });
}
