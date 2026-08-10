import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/permissions';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: AppRole;
  companyId: string | null;
}

export class AuthError extends Error {
  constructor(message: string, public code: string, public status: number) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Extracts and validates the authenticated user from the session.
 * Throws AuthError(401) when the session is missing or invalid.
 *
 * Server-validated: reads from Supabase session, not client-supplied data.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AuthError(
      'Unauthorized',
      'UNAUTHORIZED',
      401,
    );
  }

  const { data: userRow, error: rowError } = await supabase
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (rowError) {
    console.error('[getAuthenticatedUser] users table query failed', {
      userId: user.id,
      error: rowError.message,
    });
    throw new AuthError(
      'Database error during user lookup',
      'DB_ERROR',
      500,
    );
  }

  if (!userRow) {
    console.warn('[getAuthenticatedUser] No users row for uid', { userId: user.id });
    throw new AuthError(
      'User record not found',
      'USER_NOT_FOUND',
      404,
    );
  }

  const role = (userRow.role as AppRole) ?? 'accountant';

  return {
    userId: user.id,
    email: user.email ?? '',
    role,
    companyId: userRow.company_id ?? null,
  };
}
