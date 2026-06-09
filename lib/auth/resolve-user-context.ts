'use server';

import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
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
 *
 * When a users row is missing (e.g. DB was wiped but auth user still exists),
 * this function creates it via the service client so onboarding can proceed.
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
    console.warn('[resolveUserContext] No users row for uid:', user.id, '— creating via service client');
    // Row is missing (DB wipe scenario). Create it so the onboarding RPC can run.
    const service = getSupabaseServiceClient();
    const fullName = (user.user_metadata?.full_name as string | undefined) ?? null;
    await Promise.allSettled([
      service.from('users').insert({ id: user.id, email: user.email ?? '', role: 'member' }),
      service.from('profiles').insert({ id: user.id, email: user.email ?? '', full_name: fullName, role: 'user' }),
    ]);

    const metaRole = (user.user_metadata?.role as AppRole | undefined) ?? 'accountant';
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
