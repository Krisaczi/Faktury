import { cookies } from 'next/headers';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/permissions';

export const ROLE_SWITCH_COOKIE = 'rg_role_switch';

export interface EffectiveRoleResult {
  userId:        string;
  canonicalRole: AppRole;
  effectiveRole: AppRole;
  isAssumed:     boolean;
  sessionToken:  string | null;
  expiresAt:     Date | null;
}

/**
 * Resolves the effective role for the current request.
 *
 * Priority:
 * 1. If a valid, non-expired role_switch_sessions row exists for the token in
 *    the HttpOnly cookie → return assumed_role as effective role.
 * 2. Otherwise return the canonical users.role.
 *
 * Also auto-cleans expired sessions by marking reverted_at in the log table.
 */
export async function getEffectiveRole(): Promise<EffectiveRoleResult | null> {
  const supabase = await getSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Canonical role from users table
  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const canonicalRole = ((userRow?.role ?? 'accountant') as AppRole);

  // Check for active role-switch cookie
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(ROLE_SWITCH_COOKIE)?.value;

  if (!rawToken) {
    return { userId: user.id, canonicalRole, effectiveRole: canonicalRole, isAssumed: false, sessionToken: null, expiresAt: null };
  }

  // Look up the session
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session } = await (supabase as any)
    .from('role_switch_sessions')
    .select('token, owner_id, assumed_role, expires_at, log_id')
    .eq('token', rawToken)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!session) {
    return { userId: user.id, canonicalRole, effectiveRole: canonicalRole, isAssumed: false, sessionToken: null, expiresAt: null };
  }

  const expiresAt = new Date(session.expires_at);

  // Auto-expire: session past its expiry
  if (expiresAt <= new Date()) {
    // Delete the session row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('role_switch_sessions')
      .delete()
      .eq('token', rawToken);

    // Update the log row to record auto-expiry
    if (session.log_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('role_switch_logs')
        .update({ reverted_at: new Date().toISOString(), revoked_by: user.id })
        .eq('id', session.log_id)
        .is('reverted_at', null);
    }

    return { userId: user.id, canonicalRole, effectiveRole: canonicalRole, isAssumed: false, sessionToken: null, expiresAt: null };
  }

  return {
    userId:        user.id,
    canonicalRole,
    effectiveRole: session.assumed_role as AppRole,
    isAssumed:     true,
    sessionToken:  rawToken,
    expiresAt,
  };
}
