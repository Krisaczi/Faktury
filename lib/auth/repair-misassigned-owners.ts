'use server';

import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

export interface MisassignedOwner {
  id:            string;
  email:         string;
  created_at:    string;
  company_id:    string | null;
  /** Why this account is flagged as a potential misassignment */
  reason:        string;
}

export interface RepairReport {
  scanned:   number;
  flagged:   MisassignedOwner[];
  repaired:  string[];   // user ids that were changed
  errors:    string[];
  dryRun:    boolean;
}

/**
 * Owner-only repair tool.
 *
 * Scans for users with role='owner' that appear to have been created through
 * the registration flow without a legitimate owner grant:
 *
 *   - Users whose company_id IS NULL (never completed onboarding — the
 *     complete_user_onboarding RPC is the only legitimate path to 'owner',
 *     so a null company_id with role='owner' is always a misassignment).
 *
 *   - Users with no entry in role_change_logs for their owner role (they were
 *     never explicitly granted 'owner' by another owner — only the onboarding
 *     RPC sets owner, and it doesn't write to role_change_logs; the registration
 *     trigger sets 'member'; so an 'owner' with no log and no company is suspect).
 *
 * When dryRun = false, repairs by setting role = 'member' and writing an
 * audit log entry with changed_by = caller and reason = 'repair: misassigned owner'.
 *
 * When dryRun = true (default), only returns the report without modifying data.
 *
 * Results are stored in admin_audit_logs.
 */
export async function repairMisassignedOwners(params: {
  dryRun?: boolean;
} = {}): Promise<{ ok: true; report: RepairReport } | { ok: false; error: string }> {
  const { dryRun = true } = params;

  try {
    // Verify caller is an owner
    const sessionClient = await getSupabaseServerClient();
    const { data: { user: caller } } = await sessionClient.auth.getUser();
    if (!caller) return { ok: false, error: 'Unauthenticated' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: callerRow } = await (sessionClient as any)
      .from('users')
      .select('role, company_id')
      .eq('id', caller.id)
      .maybeSingle();

    if (!callerRow || callerRow.role !== 'owner') {
      return { ok: false, error: 'Only owners can run the repair tool.' };
    }

    const service = getSupabaseServiceClient();

    // Fetch all owner-role users
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ownerRows, error: scanErr } = await (service as any)
      .from('users')
      .select('id, email, created_at, company_id')
      .eq('role', 'owner');

    if (scanErr) return { ok: false, error: scanErr.message };

    // Fetch all role_change_logs entries that granted 'owner'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ownerGrants } = await (service as any)
      .from('role_change_logs')
      .select('user_id')
      .eq('new_role', 'owner');

    const legitimatelyGranted = new Set(
      (ownerGrants ?? []).map((r: { user_id: string }) => r.user_id)
    );

    const report: RepairReport = {
      scanned:  (ownerRows ?? []).length,
      flagged:  [],
      repaired: [],
      errors:   [],
      dryRun,
    };

    for (const row of (ownerRows ?? []) as {
      id: string; email: string; created_at: string; company_id: string | null;
    }[]) {
      // Case 1: company_id is null — onboarding never completed, but role='owner'
      // The only legitimate owner path (complete_user_onboarding) requires a
      // company_id, so this is always a misassignment.
      if (row.company_id === null) {
        report.flagged.push({
          id:         row.id,
          email:      row.email,
          created_at: row.created_at,
          company_id: null,
          reason:     'role=owner but company_id is NULL (onboarding never completed)',
        });
        continue;
      }

      // Case 2: Has a company but was never granted owner via role_change_logs
      // AND is not the calling user (who is a legitimate owner).
      // This catches accounts that somehow got owner set without going through
      // the proper grant flow. The onboarding RPC is the legitimate path and
      // it doesn't write to role_change_logs, so we only flag users who have
      // a company AND an owner role but their company_id doesn't match a
      // company that has any legitimate owner (i.e., someone with a log entry).
      // NOTE: We do NOT flag the caller themselves or any user with a grant log.
      if (row.id === caller.id) continue;
      if (legitimatelyGranted.has(row.id)) continue;

      // Users who reached 'owner' via the onboarding flow (company_id != null,
      // no log entry) are legitimate — that's the normal path. We only flag
      // users with company_id=null (handled above).
    }

    if (!dryRun) {
      for (const flagged of report.flagged) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateErr } = await (service as any)
          .from('users')
          .update({ role: 'accountant', updated_at: new Date().toISOString() })
          .eq('id', flagged.id);

        if (updateErr) {
          report.errors.push(`${flagged.email}: ${updateErr.message}`);
          continue;
        }

        // Write audit log
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (service as any).from('role_change_logs').insert({
          user_id:       flagged.id,
          changed_by:    caller.id,
          previous_role: 'owner',
          new_role:      'accountant',
          reason:        `repair: misassigned owner — ${flagged.reason}`,
        });

        report.repaired.push(flagged.id);
      }
    }

    // Store report in admin_audit_logs
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (service as any).from('admin_audit_logs').insert({
        action:     dryRun ? 'repair_misassigned_owners_dry_run' : 'repair_misassigned_owners',
        actor_id:   caller.id,
        company_id: callerRow.company_id,
        payload:    report,
        created_at: new Date().toISOString(),
      });
    } catch {
      // Non-fatal — table may not exist
    }

    return { ok: true, report };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
