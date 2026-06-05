'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/permissions';

// ─── Types ─────────────────────────────────────────────────────────────────

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

// ─── Allowed roles an owner may assign ─────────────────────────────────────

const ASSIGNABLE_ROLES: AppRole[] = ['admin', 'accountant', 'viewer', 'member'];

// ─── Auth guard ─────────────────────────────────────────────────────────────

async function requireOwnerOrAdmin() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: u } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!u || !['owner', 'admin'].includes(u.role ?? '')) {
    throw new Error('Brak uprawnień do zarządzania rolami.');
  }

  return { user, supabase, role: u.role as AppRole, companyId: u.company_id as string };
}

async function requireOwner() {
  const ctx = await requireOwnerOrAdmin();
  if (ctx.role !== 'owner') throw new Error('Tylko właściciel może zarządzać rolami administratora.');
  return ctx;
}

// ─── assignRole ─────────────────────────────────────────────────────────────

export async function assignRole(params: {
  targetUserId: string;
  newRole:      AppRole;
  reason?:      string;
}): Promise<RoleActionResult> {
  const { targetUserId, newRole, reason } = params;

  try {
    // Granting admin requires owner; other roles require owner or admin
    const { user, supabase, role: callerRole, companyId } = newRole === 'admin'
      ? await requireOwner()
      : await requireOwnerOrAdmin();

    if (!ASSIGNABLE_ROLES.includes(newRole)) {
      return { ok: false, error: `Rola "${newRole}" nie jest dozwolona.` };
    }

    // Target must be in the same company
    const { data: target } = await supabase
      .from('users')
      .select('id, role, company_id, email')
      .eq('id', targetUserId)
      .maybeSingle();

    if (!target) return { ok: false, error: 'Użytkownik nie istnieje.' };
    if (target.company_id !== companyId) {
      return { ok: false, error: 'Nie możesz zmieniać ról użytkowników z innych firm.' };
    }
    if (target.id === user.id) {
      return { ok: false, error: 'Nie możesz zmienić własnej roli.' };
    }
    if (target.role === 'owner') {
      return { ok: false, error: 'Nie można zmienić roli właściciela.' };
    }

    const previousRole = target.role as string;

    // Update users.role — cast required because generated types predate accountant/viewer roles
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase as any)
      .from('users')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', targetUserId);

    if (updateErr) return { ok: false, error: updateErr.message };

    // Write audit log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('role_change_logs')
      .insert({
        user_id:       targetUserId,
        changed_by:    user.id,
        previous_role: previousRole,
        new_role:      newRole,
        reason:        reason ?? null,
      });

    revalidatePath('/admin/users');
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── revokeRole (reset to member) ───────────────────────────────────────────

export async function revokeRole(params: {
  targetUserId: string;
  reason?:      string;
}): Promise<RoleActionResult> {
  return assignRole({ ...params, newRole: 'member' });
}

// ─── getUsersWithRoles ──────────────────────────────────────────────────────

export async function getUsersWithRoles(params: {
  page?:     number;
  pageSize?: number;
  search?:   string;
} = {}): Promise<RoleActionResult<{ rows: CompanyUser[]; totalCount: number }>> {
  try {
    const { supabase, companyId } = await requireOwnerOrAdmin();
    const { page = 1, pageSize = 50, search } = params;

    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('users')
      .select('id, email, role, company_id, active, created_at', { count: 'exact' })
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (search) {
      query = query.ilike('email', `%${search}%`);
    }

    const { data, count, error } = await query;
    if (error) return { ok: false, error: error.message };

    // Fetch profiles for full_name
    const userIds = (data ?? []).map((u: { id: string }) => u.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profiles } = await (supabase as any)
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);

    const profileMap = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name])
    );

    const rows: CompanyUser[] = (data ?? []).map((u: {
      id: string; email: string; role: string; company_id: string | null;
      active: boolean; created_at: string;
    }) => ({
      id:         u.id,
      email:      u.email,
      full_name:  (profileMap.get(u.id) as string | null) ?? null,
      role:       (u.role ?? 'member') as AppRole,
      active:     u.active ?? true,
      company_id: u.company_id,
      created_at: u.created_at,
    }));

    return { ok: true, data: { rows, totalCount: count ?? 0 } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── getRoleChangeLogs ──────────────────────────────────────────────────────

export async function getRoleChangeLogs(
  targetUserId?: string,
  limit = 30,
): Promise<RoleChangeLog[]> {
  try {
    const { supabase } = await requireOwnerOrAdmin();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('role_change_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (targetUserId) {
      query = query.eq('user_id', targetUserId);
    }

    const { data } = await query;
    if (!data) return [];

    // Enrich with emails
    const ids = (data as { user_id: string; changed_by: string }[]).flatMap((r) => [r.user_id, r.changed_by]);
    const allUserIds = ids.filter((id, i) => ids.indexOf(id) === i);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: users } = await (supabase as any)
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

// ─── syncAuthMetadataToUsers ────────────────────────────────────────────────
// One-shot repair tool: ensures users.role is the source of truth and
// backfills missing users rows for any auth accounts.

export async function syncAuthMetadataToUsers(): Promise<RoleActionResult<{
  updated: number;
  skipped: number;
  errors:  string[];
}>> {
  try {
    const { user: callerUser, supabase } = await requireOwner();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: usersRows } = await (supabase as any)
      .from('users')
      .select('id, email, role, company_id');

    const ALLOWED = new Set(['owner', 'admin', 'accountant', 'viewer', 'member']);
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of (usersRows ?? []) as {
      id: string; email: string; role: string; company_id: string | null;
    }[]) {
      const canonicalRole = ALLOWED.has(row.role) ? row.role : 'member';

      if (canonicalRole !== row.role) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('users')
          .update({ role: canonicalRole, updated_at: new Date().toISOString() })
          .eq('id', row.id);

        if (error) {
          errors.push(`${row.email}: ${error.message}`);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('role_change_logs').insert({
            user_id:       row.id,
            changed_by:    callerUser.id,
            previous_role: row.role,
            new_role:      canonicalRole,
            reason:        'sync: mapped invalid role to member',
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
