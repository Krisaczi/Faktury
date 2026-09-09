/**
 * Centralized owner identification helper.
 *
 * Returns true if the user is the platform owner, checking:
 * 1. The durable `is_owner` flag on the users table
 * 2. The specific owner email as a fallback (in case the flag is missing)
 *
 * This helper is used by all server-side limit enforcement points to
 * determine whether to bypass plan-based limits.
 */

const OWNER_EMAIL = 'krisaczi@yahoo.com';

export interface OwnerCheckUser {
  id?:       string;
  email:    string;
  is_owner?: boolean | null;
  role?:    string | null;
}

/**
 * Synchronous check: returns true if the user object indicates owner status.
 * Use this when you already have the user record loaded.
 */
export function isOwner(user: OwnerCheckUser | null | undefined): boolean {
  if (!user) return false;
  if (user.is_owner === true) return true;
  if (user.email === OWNER_EMAIL) return true;
  return false;
}

/**
 * The canonical owner email, used as a fallback when the is_owner flag
 * is not yet set or the column is missing.
 */
export const OWNER_EMAIL_ADDRESS = OWNER_EMAIL;

/**
 * Async check: loads the user from the database and checks owner status.
 * Use this in server-side enforcement when you only have a user ID.
 */
export async function isOwnerById(userId: string): Promise<boolean> {
  if (!userId) return false;

  const { getSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await getSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('users')
    .select('email, is_owner, role')
    .eq('id', userId)
    .maybeSingle();

  return isOwner(data as OwnerCheckUser | null);
}

/**
 * Logs a limit bypass event to the limit_bypass_audit table.
 * Called whenever an owner action bypasses a plan limit check.
 */
export async function logLimitBypass(params: {
  userId:        string;
  action:        string;
  bypassedLimit: string;
  reason?:       string;
  payload?:      Record<string, unknown>;
  ip?:           string | null;
}): Promise<void> {
  try {
    const { getSupabaseServerClient } = await import('@/lib/supabase/server');
    const supabase = await getSupabaseServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('limit_bypass_audit').insert({
      user_id:        params.userId,
      action:         params.action,
      bypassed_limit: params.bypassedLimit,
      reason:         params.reason ?? 'owner_exempt',
      payload:        params.payload ?? null,
      ip:             params.ip ?? null,
    });
  } catch {
    // Audit logging is best-effort — never block the action if logging fails
  }
}
