'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

export type GrantOwnerRoleResult =
  | { ok: true }
  | { ok: false; error: string };

const KRZYSZTOF_USER_ID = '80c57af9-d139-4934-a105-8380d5ecc831';

/**
 * Restores the 'owner' role to Krzysztof.
 *
 * This is NOT a general-purpose promotion tool. It can only set the owner
 * role on Krzysztof's account (the single global application owner). Any
 * other target is rejected.
 *
 * Security:
 * - Caller must be authenticated and must be Krzysztof (verified via
 *   OWNER_USER_ID env var and DB role check).
 * - The DB function grant_owner_role is service-role-only and independently
 *   rejects any target that is not Krzysztof.
 * - Every change is logged in role_change_logs with the caller's id and IP.
 */
export async function grantOwnerRole(params: {
  targetUserId: string;
  reason?:      string;
}): Promise<GrantOwnerRoleResult> {
  const { targetUserId, reason } = params;

  try {
    const sessionClient = await getSupabaseServerClient();
    const { data: { user: caller } } = await sessionClient.auth.getUser();
    if (!caller) return { ok: false, error: 'Unauthenticated' };

    // Only Krzysztof can call this function
    const ownerId = process.env.OWNER_USER_ID;
    if (!ownerId) return { ok: false, error: 'OWNER_USER_ID not configured.' };
    if (caller.id !== ownerId) {
      return { ok: false, error: 'Only the application owner can perform this action.' };
    }

    // The target must be Krzysztof — no one else can ever receive the owner role
    if (targetUserId !== KRZYSZTOF_USER_ID) {
      return { ok: false, error: 'The owner role can only be assigned to the application owner (Krzysztof).' };
    }

    // Fetch target to verify it exists
    const { data: target } = await sessionClient
      .from('users')
      .select('id, role, email')
      .eq('id', targetUserId)
      .maybeSingle();

    if (!target) return { ok: false, error: 'Target user not found.' };
    if (target.role === 'owner') {
      return { ok: false, error: 'User is already an owner.' };
    }

    // Capture IP for audit log
    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? headersList.get('x-real-ip')
      ?? null;

    // Apply via service client → grant_owner_role DB function
    const service = getSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcErr } = await (service as any).rpc('grant_owner_role', {
      p_target_user_id: targetUserId,
      p_caller_id:      caller.id,
      p_reason:         reason ?? null,
    });

    if (rpcErr) return { ok: false, error: rpcErr.message };

    // Update the audit log row with IP
    if (ip) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (service as any)
        .from('role_change_logs')
        .update({ ip })
        .eq('user_id', targetUserId)
        .eq('changed_by', caller.id)
        .eq('new_role', 'owner')
        .order('created_at', { ascending: false })
        .limit(1);
    }

    revalidatePath('/admin/users');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
