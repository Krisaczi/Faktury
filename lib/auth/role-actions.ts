'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/permissions';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type RoleActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface CompanyUser {
  id:           string;
  email:        string;
  full_name:    string | null;
  role:         AppRole;
  active:       boolean;
  company_id:   string | null;
  company_name: string | null;
  created_at:   string;
}

export interface RoleChangeLog {
  id:            string;
  user_id:       string;
  user_email:    string | null;
  changed_by:    string;
  changer_email: string | null;
  previous_role: string;
  new_role:      string;
  reason:        string | null;
  created_at:    string;
}

// ─── Auth guard ─────────────────────────────────────────────────────────────────

/**
 * Verifies the caller is the active owner as defined by OWNER_USER_ID env var.
 * Returns caller context on success, throws on failure.
 */
async function requireOwner() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const ownerId = process.env.OWNER_USER_ID;
  if (!ownerId) throw new Error('OWNER_USER_ID not configured.');
  if (user.id !== ownerId) throw new Error('Tylko właściciel może zarządzać rolami.');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: u } = await (supabase as any)
    .from('users')
    .select('role, company_id, active')
    .eq('id', user.id)
    .maybeSingle();

  if (!u || u.role !== 'owner' || u.active === false) {
    throw new Error('Tylko aktywny właściciel może zarządzać rolami.');
  }

  return { user, supabase, companyId: u.company_id as string };
}

// ─── writeRoleAuditLog ──────────────────────────────────────────────────────────

async function writeRoleAuditLog(opts: {
  targetUserId: string;
  changedBy:    string;
  previousRole: string;
  newRole:      string;
  reason:       string | null;
}): Promise<void> {
  const service = getSupabaseServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (service as any).from('role_change_logs').insert({
    user_id:       opts.targetUserId,
    changed_by:    opts.changedBy,
    previous_role: opts.previousRole,
    new_role:      opts.newRole,
    reason:        opts.reason ?? null,
  });
}

// ─── getUser ────────────────────────────────────────────────────────────────────

export async function getUser(
  targetUserId: string,
): Promise<RoleActionResult<CompanyUser>> {
  try {
    const { supabase, companyId } = await requireOwner();
    const service = getSupabaseServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: u, error } = await (service as any)
      .from('users')
      .select('id, email, role, company_id, active, created_at')
      .eq('id', targetUserId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (error || !u) return { ok: false, error: 'Użytkownik nie istnieje.' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('full_name')
      .eq('id', targetUserId)
      .maybeSingle();

    return {
      ok: true,
      data: {
        id:           u.id,
        email:        u.email,
        full_name:    profile?.full_name ?? null,
        role:         (u.role ?? 'accountant') as AppRole,
        active:       u.active ?? true,
        company_id:   u.company_id,
        company_name: null,
        created_at:   u.created_at,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── Role change actions ────────────────────────────────────────────────────────
// The "admin" role no longer exists. The only roles are owner (singleton) and
// accountant (default). Role changes are limited to:
//   - deactivateUser / reactivateUser (owner can toggle active status)
//   - syncRolesToCanonical (owner can repair invalid role values → accountant)
// There is no promoteToAdmin or demoteAdmin anymore.

// ─── getUsersWithRoles ──────────────────────────────────────────────────────────

export async function getUsersWithRoles(params: {
  page?:     number;
  pageSize?: number;
  search?:   string;
} = {}): Promise<RoleActionResult<{ rows: CompanyUser[]; totalCount: number }>> {
  try {
    await requireOwner();
    const service = getSupabaseServiceClient();
    const { page = 1, pageSize = 50, search } = params;

    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;

    // Platform owner sees ALL users across ALL companies.
    // Service client bypasses RLS so the company_id scoping policy doesn't hide them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (service as any)
      .from('users')
      .select('id, email, role, company_id, active, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (search) {
      query = query.ilike('email', `%${search}%`);
    }

    const { data, count, error } = await query;
    if (error) return { ok: false, error: error.message };

    const userIds = (data ?? []).map((u: { id: string }) => u.id);
    const companyIds = Array.from(new Set(
      (data ?? []).map((u: { company_id: string | null }) => u.company_id).filter(Boolean)
    )) as string[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [profilesRes, companiesRes] = await Promise.all([
      (service as any).from('profiles').select('id, full_name').in('id', userIds),
      companyIds.length > 0
        ? (service as any).from('companies').select('id, name').in('id', companyIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap = new Map(
      (profilesRes.data ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name])
    );
    const companyMap = new Map(
      (companiesRes.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name])
    );

    const rows: CompanyUser[] = (data ?? []).map((u: {
      id: string; email: string; role: string; company_id: string | null;
      active: boolean; created_at: string;
    }) => ({
      id:           u.id,
      email:        u.email,
      full_name:    (profileMap.get(u.id) as string | null) ?? null,
      role:         (u.role ?? 'accountant') as AppRole,
      active:       u.active ?? true,
      company_id:   u.company_id,
      company_name: u.company_id ? (companyMap.get(u.company_id) as string | null) ?? null : null,
      created_at:   u.created_at,
    }));

    return { ok: true, data: { rows, totalCount: count ?? 0 } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── getRoleChangeLogs ──────────────────────────────────────────────────────────

export async function getRoleChangeLogs(
  targetUserId?: string,
  limit = 30,
): Promise<RoleChangeLog[]> {
  try {
    await requireOwner();
    const service = getSupabaseServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (service as any)
      .from('role_change_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (targetUserId) {
      query = query.eq('user_id', targetUserId);
    }

    const { data } = await query;
    if (!data) return [];

    const ids = (data as { user_id: string; changed_by: string }[]).flatMap((r) => [r.user_id, r.changed_by]);
    const allUserIds = ids.filter((id, i) => ids.indexOf(id) === i);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: users } = await (service as any)
      .from('users')
      .select('id, email')
      .in('id', allUserIds);

    const emailMap = new Map(
      (users ?? []).map((u: { id: string; email: string }) => [u.id, u.email])
    );

    return (data as {
      id: string; user_id: string; changed_by: string;
      previous_role: string; new_role: string; reason: string | null; created_at: string;
    }[]).map((r) => ({
      id:            r.id,
      user_id:       r.user_id,
      user_email:    (emailMap.get(r.user_id) as string | null) ?? null,
      changed_by:    r.changed_by,
      changer_email: (emailMap.get(r.changed_by) as string | null) ?? null,
      previous_role: r.previous_role,
      new_role:      r.new_role,
      reason:        r.reason,
      created_at:    r.created_at,
    }));
  } catch {
    return [];
  }
}

// ─── syncRolesToCanonical ───────────────────────────────────────────────────────
// One-shot repair: ensures all users.role values are valid canonical roles.

export async function syncRolesToCanonical(): Promise<RoleActionResult<{
  updated: number;
  skipped: number;
  errors:  string[];
}>> {
  try {
    const { user: callerUser, supabase } = await requireOwner();
    const service = getSupabaseServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: usersRows } = await (service as any)
      .from('users')
      .select('id, email, role, company_id');

    const VALID = new Set(['owner', 'accountant']);
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of (usersRows ?? []) as {
      id: string; email: string; role: string; company_id: string | null;
    }[]) {
      // Legacy roles → accountant
      const canonicalRole = VALID.has(row.role) ? row.role : 'accountant';

      if (canonicalRole !== row.role) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (service as any)
          .from('users')
          .update({ role: canonicalRole, updated_at: new Date().toISOString() })
          .eq('id', row.id);

        if (error) {
          errors.push(`${row.email}: ${error.message}`);
        } else {
          await writeRoleAuditLog({
            targetUserId: row.id,
            changedBy:    callerUser.id,
            previousRole: row.role,
            newRole:      canonicalRole,
            reason:       'sync: mapped invalid role to accountant',
          });
          updated++;
        }
      } else {
        skipped++;
      }
    }

    revalidatePath('/admin/users');
    return { ok: true, data: { updated, skipped, errors } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}
