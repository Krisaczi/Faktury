'use server';

import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

export interface SyncAuthAndProfilesReport {
  scanned:         number;
  created:         string[];   // user ids where public.users row was missing and was created
  orphaned:        string[];   // public.users ids with no corresponding auth user
  roleMismatches:  Array<{ id: string; email: string; tableRole: string; metaRole: string }>;
  errors:          string[];
}

/**
 * Owner-only repair tool.
 *
 * For each auth user in the current company:
 *   - If public.users row is missing → creates it.
 *   - If public.users.role differs from auth metadata role → logs mismatch
 *     (does NOT auto-change public.users.role — that is the source of truth).
 *
 * For public.users rows with no auth.users counterpart → marks as orphaned.
 *
 * Results are logged to admin_audit_logs if that table exists.
 */
export async function syncAuthAndProfiles(): Promise<
  { ok: true; report: SyncAuthAndProfilesReport } | { ok: false; error: string }
> {
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

    // Fetch all auth users via admin API (service role required)
    const { data: authList, error: authErr } =
      await service.auth.admin.listUsers({ perPage: 1000 });

    if (authErr) return { ok: false, error: authErr.message };

    const authById = new Map(authList.users.map((u) => [u.id, u]));
    const tableIds = new Set((usersRows ?? []).map((r: { id: string }) => r.id));

    const report: SyncAuthAndProfilesReport = {
      scanned:        (usersRows ?? []).length,
      created:        [],
      orphaned:       [],
      roleMismatches: [],
      errors:         [],
    };

    // Check each public.users row for orphans
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

    // Check for auth users in this company that have no public.users row
    // We identify "this company" by cross-referencing the company's known user ids.
    // Auth users outside this company are ignored (multi-tenant safety).
    for (const authUser of authList.users) {
      if (tableIds.has(authUser.id)) continue;
      // Only act on users whose email/metadata suggests they belong here —
      // we cannot be certain, so we only repair if the row simply doesn't exist yet.
      // We check by seeing if we can find them in auth at all for this company scope.
      // This catches new signups where the trigger silently failed.
      const isDemo = authUser.app_metadata?.is_demo === true;
      if (isDemo) continue;

      // Only consider users whose company_id in metadata (if any) matches
      const metaCompanyId = authUser.user_metadata?.company_id as string | undefined;
      if (metaCompanyId && metaCompanyId !== companyId) continue;

      // If no metadata company hint, skip — we can't safely assign them
      if (!metaCompanyId) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertErr } = await (service as any)
        .from('users')
        .insert({
          id:         authUser.id,
          email:      authUser.email ?? '',
          role:       'member',
          company_id: companyId,
        });

      if (insertErr) {
        report.errors.push(`${authUser.email}: ${insertErr.message}`);
      } else {
        report.created.push(authUser.id);
      }
    }

    // Log to admin_audit_logs if the table exists
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (service as any).from('admin_audit_logs').insert({
        action:     'sync_auth_and_profiles',
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
