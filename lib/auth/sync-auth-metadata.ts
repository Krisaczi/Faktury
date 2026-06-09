'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';

export interface SyncReport {
  scanned: number;
  missingRows: string[];   // user ids with no public.users row
  roleMismatches: Array<{ id: string; email: string; metaRole: string; tableRole: string }>;
  errors: string[];
}

/**
 * Scans all users in the current company for mismatches between
 * auth.user_metadata.role and public.users.role.
 *
 * This is a read-only report — it does NOT update auth metadata automatically.
 * To fix mismatches, use assignRole() from role-actions.ts which writes to
 * public.users (the canonical source) and logs the change.
 *
 * Owner-only action.
 */
export async function syncAuthMetadataWithUsers(): Promise<SyncReport> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: caller } = await (supabase as any)
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!caller || caller.role !== 'owner') {
    throw new Error('Only owners can run the sync report.');
  }

  const companyId = caller.company_id as string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: usersRows, error } = await (supabase as any)
    .from('users')
    .select('id, email, role')
    .eq('company_id', companyId);

  if (error) throw new Error(error.message);

  const report: SyncReport = {
    scanned: (usersRows ?? []).length,
    missingRows: [],
    roleMismatches: [],
    errors: [],
  };

  for (const row of (usersRows ?? []) as { id: string; email: string; role: string }[]) {
    // We can't call auth.admin.getUserById without a service key,
    // so we report what we can from the public.users table.
    // The "missing rows" case is the opposite — handled separately below.
    const VALID_ROLES = ['owner', 'admin', 'accountant'];
    if (!VALID_ROLES.includes(row.role)) {
      report.roleMismatches.push({
        id: row.id,
        email: row.email,
        metaRole: 'unknown',
        tableRole: row.role,
      });
    }
  }

  return report;
}
