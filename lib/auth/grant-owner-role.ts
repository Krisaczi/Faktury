'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

export type GrantOwnerRoleResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Grants the 'owner' role to a target user.
 *
 * Security:
 * - Caller must be an owner (validated server-side from users.role).
 * - Target must be in the same company.
 * - Caller cannot grant owner to themselves (they already are one).
 * - Role change is applied via the grant_owner_role DB function (service role)
 *   which runs as postgres and bypasses RLS, but itself validates the caller's
 *   role from the DB before applying any change.
 * - Every grant is logged in role_change_logs with the caller's id and IP.
 */
export async function grantOwnerRole(params: {
  targetUserId: string;
  reason?:      string;
}): Promise<GrantOwnerRoleResult> {
  const { targetUserId, reason } = params;

  try {
    // Verify session and caller's role from the DB (not user_metadata)
    const sessionClient = await getSupabaseServerClient();
    const { data: { user: caller } } = await sessionClient.auth.getUser();
    if (!caller) return { ok: false, error: 'Unauthenticated' };

    const { data: callerRow } = await sessionClient
      .from('users')
      .select('role, company_id')
      .eq('id', caller.id)
      .maybeSingle();

    if (!callerRow || callerRow.role !== 'owner') {
      return { ok: false, error: 'Only owners can grant the owner role.' };
    }

    if (caller.id === targetUserId) {
      return { ok: false, error: 'You are already an owner.' };
    }

    // Fetch target to validate same company and current role
    const { data: target } = await sessionClient
      .from('users')
      .select('id, role, company_id, email')
      .eq('id', targetUserId)
      .maybeSingle();

    if (!target) return { ok: false, error: 'Target user not found.' };
    if (target.company_id !== callerRow.company_id) {
      return { ok: false, error: 'Cannot grant owner role to a user from a different company.' };
    }
    if (target.role === 'owner') {
      return { ok: false, error: 'User is already an owner.' };
    }

    // Capture IP for audit log
    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? headersList.get('x-real-ip')
      ?? null;

    // Apply via service client → grant_owner_role DB function
    // The function independently validates caller role and writes the audit log.
    const service = getSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcErr } = await (service as any).rpc('grant_owner_role', {
      p_target_user_id: targetUserId,
      p_caller_id:      caller.id,
      p_reason:         reason ?? null,
    });

    if (rpcErr) return { ok: false, error: rpcErr.message };

    // Update the audit log row with IP (the RPC already inserted it without IP)
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
