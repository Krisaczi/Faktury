import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { forceSyncUser } from '@/lib/plans/reconciliation';

// POST /api/owner/users/[id]/force-sync
// Force-overwrites the local subscription record from the company's product_type.
// Body: { reason?: string }

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

  const result = await forceSyncUser(user.id, params.id, ownerIp, {
    reason: body.reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Błąd wymuszonej synchronizacji.' }, { status: 500 });
  }

  return NextResponse.json({
    ok:      true,
    userId:  result.userId,
    fromPlan: result.fromPlan,
    toPlan:   result.toPlan,
    action:   result.action,
    auditId:  result.auditId,
    message:  `Wymuszona synchronizacja: ${result.fromPlan} → ${result.toPlan}.`,
  });
}
