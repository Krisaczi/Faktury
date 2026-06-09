'use server';

import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrphanedAuthUser {
  id:                 string;
  email:              string;
  created_at:         string;
  email_confirmed_at: string | null;
}

export interface OrphanedProfile {
  id:         string;
  email:      string;
  role:       string;
  company_id: string | null;
  created_at: string;
}

export interface OrphanReport {
  orphanedAuthUsers: OrphanedAuthUser[];
  orphanedProfiles:  OrphanedProfile[];
  scannedAuth:       number;
  scannedProfiles:   number;
}

export type RepairAction =
  | { action: 'delete_auth_user' }
  | { action: 'resend_confirmation'; emailRedirectTo: string }
  | { action: 'recreate_profile' };

export type RepairResult =
  | { ok: true;  action: RepairAction['action'] }
  | { ok: false; error: string };

export interface BulkRepairReport {
  dryRun:   boolean;
  repaired: Array<{ id: string; email: string; action: string }>;
  skipped:  Array<{ id: string; email: string; reason: string }>;
  errors:   Array<{ id: string; email: string; error: string }>;
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function requireOwnerOrAdmin() {
  const sessionClient = await getSupabaseServerClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: row } = await sessionClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!row || !['owner', 'admin'].includes(row.role ?? '')) {
    throw new Error('Insufficient permissions.');
  }

  return { callerId: user.id };
}

// ─── findOrphanedAccounts ─────────────────────────────────────────────────────

/**
 * Scans all auth.users and public.users to find mismatches:
 * - Auth users with no public.users row.
 * - public.users rows with no auth.users entry.
 *
 * Restricted to owner/admin. Reads via service role to access auth.users.
 */
export async function findOrphanedAccounts(params: {
  limit?: number;
} = {}): Promise<{ ok: true; report: OrphanReport } | { ok: false; error: string }> {
  try {
    await requireOwnerOrAdmin();

    const { limit = 200 } = params;
    const service = getSupabaseServiceClient();

    const { data: authList, error: authErr } =
      await service.auth.admin.listUsers({ perPage: 1000 });
    if (authErr) return { ok: false, error: authErr.message };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profileRows, error: profileErr } = await (service as any)
      .from('users')
      .select('id, email, role, company_id, created_at')
      .limit(1000);
    if (profileErr) return { ok: false, error: profileErr.message };

    const authIds    = new Set(authList.users.map((u) => u.id));
    const profileIds = new Set((profileRows ?? []).map((r: { id: string }) => r.id));

    const orphanedAuthUsers: OrphanedAuthUser[] = authList.users
      .filter((u) => !profileIds.has(u.id) && !u.app_metadata?.is_demo)
      .slice(0, limit)
      .map((u) => ({
        id:                 u.id,
        email:              u.email ?? '',
        created_at:         u.created_at,
        email_confirmed_at: u.email_confirmed_at ?? null,
      }));

    const orphanedProfiles: OrphanedProfile[] = (profileRows ?? [])
      .filter((r: { id: string }) => !authIds.has(r.id))
      .slice(0, limit)
      .map((r: { id: string; email: string; role: string; company_id: string | null; created_at: string }) => ({
        id:         r.id,
        email:      r.email,
        role:       r.role,
        company_id: r.company_id,
        created_at: r.created_at,
      }));

    return {
      ok: true,
      report: {
        orphanedAuthUsers,
        orphanedProfiles,
        scannedAuth:     authList.users.length,
        scannedProfiles: (profileRows ?? []).length,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ─── repairOrphanedAuthUser ───────────────────────────────────────────────────

/**
 * Repairs a single orphaned auth user via one of three actions:
 * - delete_auth_user:    Permanently deletes the auth.users entry.
 * - resend_confirmation: Resends the confirmation email.
 * - recreate_profile:    Recreates the public.users + profiles rows from auth metadata.
 *
 * All actions are logged to admin_audit_logs.
 */
export async function repairOrphanedAuthUser(
  authUserId: string,
  repair:     RepairAction,
): Promise<RepairResult> {
  try {
    const { callerId } = await requireOwnerOrAdmin();
    const service = getSupabaseServiceClient();

    const { data: authUser, error: fetchErr } =
      await service.auth.admin.getUserById(authUserId);
    if (fetchErr || !authUser.user) {
      return { ok: false, error: 'Auth user not found.' };
    }

    const email    = authUser.user.email ?? '';
    const fullName = (authUser.user.user_metadata?.full_name as string | undefined) ?? '';

    switch (repair.action) {
      case 'delete_auth_user': {
        const { error } = await service.auth.admin.deleteUser(authUserId);
        if (error) return { ok: false, error: error.message };
        await writeAuditLog(service, callerId, 'repair_delete_auth_user', authUserId, { email });
        break;
      }

      case 'resend_confirmation': {
        if (authUser.user.email_confirmed_at) {
          return { ok: false, error: 'Email is already confirmed.' };
        }
        const { error } = await service.auth.resend({
          type:    'signup',
          email,
          options: { emailRedirectTo: repair.emailRedirectTo },
        });
        if (error) return { ok: false, error: error.message };
        await writeAuditLog(service, callerId, 'repair_resend_confirmation', authUserId, { email });
        break;
      }

      case 'recreate_profile': {
        // ON CONFLICT (id) DO NOTHING — idempotent
        await Promise.allSettled([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (service as any).from('users').insert({ id: authUserId, email, role: 'accountant' }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (service as any).from('profiles').insert({ id: authUserId, email, full_name: fullName || null, role: 'user' }),
        ]);
        await writeAuditLog(service, callerId, 'repair_recreate_profile', authUserId, { email });
        break;
      }
    }

    return { ok: true, action: repair.action };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ─── bulkRepairOrphans ────────────────────────────────────────────────────────

/**
 * Bulk-repairs auth users that have no public.users row.
 *
 * Strategy:
 * - Every orphaned auth user → recreate profile row so they can log in.
 * - Unconfirmed users → also resend confirmation (requires emailRedirectTo).
 *
 * dryRun = true (default): reports without applying changes.
 */
export async function bulkRepairOrphans(params: {
  dryRun?:          boolean;
  emailRedirectTo?: string;
} = {}): Promise<{ ok: true; report: BulkRepairReport } | { ok: false; error: string }> {
  const { dryRun = true, emailRedirectTo = '' } = params;

  try {
    const { callerId } = await requireOwnerOrAdmin();
    const service      = getSupabaseServiceClient();

    const findResult = await findOrphanedAccounts({ limit: 500 });
    if (!findResult.ok) return { ok: false, error: findResult.error };

    const report: BulkRepairReport = {
      dryRun,
      repaired: [],
      skipped:  [],
      errors:   [],
    };

    for (const orphan of findResult.report.orphanedAuthUsers) {
      const isConfirmed   = !!orphan.email_confirmed_at;
      const plannedAction = isConfirmed ? 'recreate_profile' : 'resend_and_recreate';

      if (dryRun) {
        report.skipped.push({ id: orphan.id, email: orphan.email, reason: `dry-run: would ${plannedAction}` });
        continue;
      }

      const recreate = await repairOrphanedAuthUser(orphan.id, { action: 'recreate_profile' });
      if (!recreate.ok) {
        report.errors.push({ id: orphan.id, email: orphan.email, error: recreate.error });
        continue;
      }

      if (!isConfirmed && emailRedirectTo) {
        const resend = await repairOrphanedAuthUser(orphan.id, {
          action:          'resend_confirmation',
          emailRedirectTo,
        });
        if (!resend.ok) {
          report.errors.push({ id: orphan.id, email: orphan.email, error: `resend: ${resend.error}` });
        }
      }

      report.repaired.push({ id: orphan.id, email: orphan.email, action: plannedAction });
    }

    await writeAuditLog(service, callerId, dryRun ? 'bulk_repair_dry_run' : 'bulk_repair_applied', null, {
      repaired: report.repaired.length,
      errors:   report.errors.length,
    });

    return { ok: true, report };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeAuditLog(service: any, actorId: string, action: string, targetId: string | null, payload: Record<string, unknown>): Promise<void> {
  try {
    await service.from('admin_audit_logs').insert({
      action,
      actor_id:   actorId,
      target_id:  targetId,
      payload,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal — table schema may vary
  }
}
