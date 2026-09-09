import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isOwner } from '@/lib/auth/is-owner';

/**
 * GET /api/owner/limit-bypass-audit
 *
 * Returns recent limit bypass audit entries for the owner.
 * Owner-only. Returns the last 50 entries.
 */
export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userRow } = await (supabase as any)
    .from('users')
    .select('email, is_owner, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!isOwner(userRow as { email: string; is_owner?: boolean | null; role?: string | null } | null)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: entries, error } = await (supabase as any)
    .from('limit_bypass_audit')
    .select('id, action, bypassed_limit, reason, payload, ip, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: entries ?? [] });
}
