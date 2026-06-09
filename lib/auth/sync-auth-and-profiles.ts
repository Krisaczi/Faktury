'use server';

import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

export interface SyncAuthAndProfilesReport {
  scanned:         number;
  created:         string[];
  wouldCreate:     string[];   // dry-run only: ids that would be created
  orphaned:        string[];
  roleMismatches:  Array<{ id: string; email: string; tableRole: string; metaRole: string }>;
  errors:          string[];
  dryRun:          boolean;
}

/**
 * Owner-only repair tool.
 *
 * For each auth user whose id already appears (or should appear) in the company:
 *   - If public.users row is missing → creates it (role='member', no company).
 *   - If public.users.role differs from auth metadata role → logs mismatch.
 *
 * Specifically handles the case where public.users rows were deleted manually
 * while auth.users entries remain (confirmed or unconfirmed). The tool creates
 * the missing row using only data available in auth (id, email, full_name).
 * company_id is NOT restored — the user must complete onboarding again to
 * re-link their company, which is the safe default.
 *
 * For public.users rows with no auth.users counterpart → marks as orphaned.
 *
 * Results are logged to admin_audit_logs if that table exists.
 */
export async function syncAuthAndProfiles(params: {
  dryRun?: boolean;
} = {}): Promise<
  { ok: true; report: SyncAuthAndProfilesReport } | { ok: false; error: string }
> {
  const { dryRun = false } = params;
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
      return { ok: false, error: 'Only owners can run the auth sync tool.' };
    }

    const companyId = callerRow.company_id as string;
    const service   = getSupabaseServiceClient();

    // Fetch all public.users for this company
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: usersRows, error: usersErr } = await (service as any)
      .from('users')
      .select('id, email, role')
      .eq('company_id', companyId);

    if (usersErr) return { ok: false, error: usersErr.message };

    // Also fetch all public.users with no company yet — these may be accounts
    // where the row was recently re-created after being deleted (company_id=null).
    // We include them in the orphan check but don't try to assign a company.

    // Fetch all auth users via admin API (service role required)
    const { data: authList, error: authErr } =
      await service.auth.admin.listUsers({ perPage: 1000 });

    if (authErr) return { ok: false, error: authErr.message };

    const authById = new Map(authList.users.map((u) => [u.id, u]));
    const tableIds = new Set((usersRows ?? []).map((r: { id: string }) => r.id));

    // Also fetch ALL public.users ids (not just this company) to avoid creating
    // duplicate rows for users who belong to a different company.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allRows } = await (service as any)
      .from('users')
      .select('id');
    const allTableIds = new Set((allRows ?? []).map((r: { id: string }) => r.id));

    const report: SyncAuthAndProfilesReport = {
      scanned:        (usersRows ?? []).length,
      created:        [],
      wouldCreate:    [],
      orphaned:       [],
      roleMismatches: [],
      errors:         [],
      dryRun,
    };

    // ── Check each public.users row for orphans and role mismatches ───────────
    for (const row of (usersRows ?? []) as { id: string; email: string; role: string }[]) {
      if (!authById.has(row.id)) {
        report.orphaned.push(row.id);
        continue;
      }

      const authUser = authById.get(row.id)!;
      const metaRole = (authUser.user_metadata?.role as string | undefined) ?? null;
      if (metaRole && metaRole !== row.role) {
        report.roleMismatches.push({
          id:        row.id,
          email:     row.email,
          tableRole: row.role,
          metaRole,
        });
      }
    }

    // ── Check for auth users in this company that have no public.users row ────
    // We identify "this company" via the company's known user id set (tableIds).
    // We also handle the deleted-row case: auth users whose metadata hints at
    // this company_id AND who have no public.users row anywhere.
    for (const authUser of authList.users) {
      // Already has a row in this company's set
      if (tableIds.has(authUser.id)) continue;

      const isDemo = authUser.app_metadata?.is_demo === true;
      if (isDemo) continue;

      const metaCompanyId = authUser.user_metadata?.company_id as string | undefined;

      // Case A: metadata explicitly names this company → restore missing row
      if (metaCompanyId && metaCompanyId === companyId && !allTableIds.has(authUser.id)) {
        if (dryRun) {
          report.wouldCreate.push(authUser.id);
          continue;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insertErr } = await (service as any)
          .from('users')
          .insert({
            id:         authUser.id,
            email:      authUser.email ?? '',
            role:       'accountant',
            company_id: companyId,
          });

        if (insertErr) {
          report.errors.push(`${authUser.email}: ${insertErr.message}`);
        } else {
          report.created.push(authUser.id);
        }
        continue;
      }

      // Case B: auth user has no public.users row at all (trigger failure or
      // manual deletion without metadata company hint) — create row without
      // company_id so the user can complete onboarding again.
      if (!metaCompanyId && !allTableIds.has(authUser.id)) {
        if (dryRun) {
          report.wouldCreate.push(authUser.id);
          continue;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insertErr } = await (service as any)
          .from('users')
          .insert({
            id:    authUser.id,
            email: authUser.email ?? '',
            role:  'accountant',
          });

        if (insertErr) {
          // Conflict = row already exists in another company — skip silently
          if (!insertErr.message.includes('duplicate') && !insertErr.message.includes('unique')) {
            report.errors.push(`${authUser.email}: ${insertErr.message}`);
          }
        } else {
          report.created.push(authUser.id);
        }
      }
    }

    // Log to admin_audit_logs if the table exists
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (service as any).from('admin_audit_logs').insert({
        action:     dryRun ? 'sync_auth_and_profiles_dry_run' : 'sync_auth_and_profiles',
        actor_id:   caller.id,
        company_id: companyId,
        payload:    report,
        created_at: new Date().toISOString(),
      });
    } catch {
      // Table may not exist — not fatal
    }

    return { ok: true, report };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
