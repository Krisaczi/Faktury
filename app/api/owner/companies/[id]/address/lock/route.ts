import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const lockSchema = z.object({
  locked: z.boolean(),
  reason: z.string().max(500).optional(),
});

/**
 * POST /api/owner/companies/[id]/address/lock
 * Owner-only: lock or unlock address editing for a specific company.
 */
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
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = lockSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 422 });
  }

  const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from('companies')
    .update({
      address_locked: parsed.data.locked,
      updated_at:     nowIso,
    })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to update lock state' }, { status: 500 });
  }

  await supabase.from('company_address_audit').insert({
    company_id:  params.id,
    changed_by:  user.id,
    change_type: parsed.data.locked ? 'lock' : 'unlock',
    reason:      parsed.data.reason ?? null,
    ip:          ownerIp,
  });

  return NextResponse.json({ ok: true, locked: parsed.data.locked });
}
