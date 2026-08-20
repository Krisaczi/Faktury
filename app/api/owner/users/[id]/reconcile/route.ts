import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { reconcileUser } from '@/lib/plans/reconciliation';

// POST /api/owner/users/[id]/reconcile
// Triggers immediate reconciliation for a single user.
// Body: { dryRun?: boolean, reason?: string }

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
  const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;

  const result = await reconcileUser(user.id, params.id, ownerIp, {
    dryRun: body.dryRun === true,
    reason: body.reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Błąd uzgadniania.' }, { status: 500 });
  }

  return NextResponse.json({
    ok:         true,
    userId:     result.userId,
    fromPlan:   result.fromPlan,
    toPlan:     result.toPlan,
    action:     result.action,
    auditId:    result.auditId,
    message:    result.action === 'noop'
      ? 'Plan jest już spójny — brak zmian.'
      : result.action === 'dry_run'
        ? `Wykryto niezgodność: ${result.fromPlan} → ${result.toPlan} (tryb podglądu, brak zmian).`
        : `Plan uzgodniony: ${result.fromPlan} → ${result.toPlan}.`,
  });
}
