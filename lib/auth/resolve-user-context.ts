'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/permissions';

export interface UserContext {
  id: string;
  email: string;
  role: AppRole;
  companyId: string | null;
  /** true when company_id is populated — the canonical onboarding flag */
  onboardingCompleted: boolean;
  /** false when no row exists in public.users for this auth user */
  userRowExists: boolean;
}

/**
 * Resolves the canonical user context for the currently authenticated session.
 * Returns null when no session exists.
 *
 * Source of truth priority:
 *   1. public.users (role, company_id)
 *   2. auth.user().user_metadata (fallback when users row is missing)
 */
export async function resolveUserContext(): Promise<UserContext | null> {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) return null;

  const { data: userRow, error: rowError } = await supabase
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (rowError) {
    console.warn('[resolveUserContext] users table query failed:', rowError.message, 'uid:', user.id);
  }

  if (!userRow) {
    // Row missing — fall back to auth metadata (new account not yet trigger-created)
    console.warn('[resolveUserContext] No users row for uid:', user.id, '— falling back to auth metadata');
    const metaRole = (user.user_metadata?.role as AppRole | undefined) ?? 'member';
    return {
      id: user.id,
      email: user.email ?? '',
      role: metaRole,
      companyId: null,
      onboardingCompleted: false,
      userRowExists: false,
    };
  }

  const role = (userRow.role as AppRole) ?? 'member';
  const companyId = userRow.company_id ?? null;

  return {
    id: user.id,
    email: user.email ?? '',
    role,
    companyId,
    onboardingCompleted: companyId !== null,
    userRowExists: true,
  };
}
