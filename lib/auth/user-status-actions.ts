'use server';

import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StatusActionResult<T = void> =
  | { ok: true;  data: T }
  | { ok: false; error: string };

export interface UserStatusRow {
  id:         string;
  email:      string;
  full_name:  string | null;
  role:       string;
  active:     boolean;
  company_id: string | null;
  created_at: string;
}

export interface StatusChangeLog {
  id:              string;
  target_user_id:  string;
  target_email:    string | null;
  changed_by:      string | null;
  changer_email:   string | null;
  previous_active: boolean;
  new_active:      boolean;
  reason:          string | null;
  created_at:      string;
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function requireActiveOwner() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const ownerId = process.env.OWNER_USER_ID;
  if (!ownerId) throw new Error('OWNER_USER_ID not configured.');
  if (user.id !== ownerId) throw new Error('Tylko aktywny właściciel może zarządzać statusem kont.');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: u } = await (supabase as any)
    .from('users')
    .select('role, company_id, active')
    .eq('id', user.id)
    .maybeSingle();

  if (!u || u.role !== 'owner' || u.active === false) {
    throw new Error('Tylko aktywny właściciel może zarządzać statusem kont.');
  }

  return { callerId: user.id, companyId: u.company_id as string };
}

// ─── revokeSessions ───────────────────────────────────────────────────────────

/**
 * Invalidates all active sessions for a user via the GoTrue Admin REST API.
 * Non-fatal: if the call fails, the middleware active-flag check still enforces
 * the deactivation on the next request.
 */
export async function revokeSessions(userId: string): Promise<void> {
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}/logout`;
    await fetch(url, {
      method:  'POST',
      headers: {
        apikey:        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    });
  } catch (e) {
    console.error('[revokeSessions] failed (non-fatal):', e);
  }
}

// ─── writeStatusAuditLog ──────────────────────────────────────────────────────

async function writeStatusAuditLog(opts: {
  targetUserId:   string;
  changedBy:      string | null;
  previousActive: boolean;
  newActive:      boolean;
  reason:         string | null;
  ip:             string | null;
}): Promise<void> {
  const service = getSupabaseServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (service as any).from('user_status_changes').insert({
    target_user_id:  opts.targetUserId,
    changed_by:      opts.changedBy,
    previous_active: opts.previousActive,
    new_active:      opts.newActive,
    reason:          opts.reason ?? null,
    ip:              opts.ip ?? null,
    created_at:      new Date().toISOString(),
  });
}

// ─── deactivateUser ───────────────────────────────────────────────────────────

export async function deactivateUser(params: {
  targetUserId: string;
  reason?:      string;
  ip?:          string;
}): Promise<StatusActionResult<{ auditId: string }>> {
  const { targetUserId, reason, ip } = params;

  try {
    const { callerId, companyId } = await requireActiveOwner();
    const service = getSupabaseServiceClient();

    // Fetch target — must exist and belong to the same company
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: target, error: fetchErr } = await (service as any)
      .from('users')
      .select('id, email, role, company_id, active')
      .eq('id', targetUserId)
      .maybeSingle();

    if (fetchErr || !target) {
      return { ok: false, error: 'Użytkownik nie istnieje.' };
    }
    if (target.company_id !== companyId) {
      return { ok: false, error: 'Brak uprawnień do zarządzania tym kontem.' };
    }
    if (target.id === callerId) {
      return { ok: false, error: 'Nie możesz dezaktywować własnego konta.' };
    }
    if (target.role === 'owner') {
      return { ok: false, error: 'Nie można dezaktywować konta właściciela.' };
    }
    if (!target.active) {
      return { ok: false, error: 'Konto jest już nieaktywne.' };
    }

    // Set active = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (service as any)
      .from('users')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', targetUserId);

    if (updateErr) return { ok: false, error: updateErr.message };

    // Write audit log
    await writeStatusAuditLog({
      targetUserId,
      changedBy:      callerId,
      previousActive: true,
      newActive:      false,
      reason:         reason ?? null,
      ip:             ip ?? null,
    });

    // Revoke sessions (non-fatal)
    await revokeSessions(targetUserId);

    console.info('[deactivateUser] deactivated', targetUserId, 'by', callerId);

    // Fetch the inserted audit row id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: auditRow } = await (service as any)
      .from('user_status_changes')
      .select('id')
      .eq('target_user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return { ok: true, data: { auditId: auditRow?.id ?? '' } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── reactivateUser ───────────────────────────────────────────────────────────

export async function reactivateUser(params: {
  targetUserId: string;
  reason?:      string;
  ip?:          string;
}): Promise<StatusActionResult<{ auditId: string }>> {
  const { targetUserId, reason, ip } = params;

  try {
    const { callerId, companyId } = await requireActiveOwner();
    const service = getSupabaseServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: target, error: fetchErr } = await (service as any)
      .from('users')
      .select('id, email, role, company_id, active')
      .eq('id', targetUserId)
      .maybeSingle();

    if (fetchErr || !target) {
      return { ok: false, error: 'Użytkownik nie istnieje.' };
    }
    if (target.company_id !== companyId) {
      return { ok: false, error: 'Brak uprawnień do zarządzania tym kontem.' };
    }
    if (target.active) {
      return { ok: false, error: 'Konto jest już aktywne.' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (service as any)
      .from('users')
      .update({ active: true, updated_at: new Date().toISOString() })
      .eq('id', targetUserId);

    if (updateErr) return { ok: false, error: updateErr.message };

    await writeStatusAuditLog({
      targetUserId,
      changedBy:      callerId,
      previousActive: false,
      newActive:      true,
      reason:         reason ?? null,
      ip:             ip ?? null,
    });

    console.info('[reactivateUser] reactivated', targetUserId, 'by', callerId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: auditRow } = await (service as any)
      .from('user_status_changes')
      .select('id')
      .eq('target_user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return { ok: true, data: { auditId: auditRow?.id ?? '' } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── findInactiveUsers ────────────────────────────────────────────────────────

export async function findInactiveUsers(params: {
  page?:     number;
  pageSize?: number;
} = {}): Promise<StatusActionResult<{ rows: UserStatusRow[]; totalCount: number }>> {
  try {
    const { companyId } = await requireActiveOwner();
    const { page = 1, pageSize = 50 } = params;

    const service = getSupabaseServiceClient();
    const from    = (page - 1) * pageSize;
    const to      = from + pageSize - 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, count, error } = await (service as any)
      .from('users')
      .select('id, email, role, company_id, active, created_at', { count: 'exact' })
      .eq('company_id', companyId)
      .eq('active', false)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) return { ok: false, error: error.message };

    const userIds: string[] = (data ?? []).map((u: { id: string }) => u.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profiles } = userIds.length > 0
      ? await (service as any).from('profiles').select('id, full_name').in('id', userIds)
      : { data: [] };

    const profileMap = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name])
    );

    const rows: UserStatusRow[] = (data ?? []).map((u: {
      id: string; email: string; role: string; company_id: string | null;
      active: boolean; created_at: string;
    }) => ({
      id:         u.id,
      email:      u.email,
      full_name:  (profileMap.get(u.id) as string | null) ?? null,
      role:       u.role,
      active:     u.active,
      company_id: u.company_id,
      created_at: u.created_at,
    }));

    return { ok: true, data: { rows, totalCount: count ?? 0 } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── getStatusChangeLogs ──────────────────────────────────────────────────────

export async function getStatusChangeLogs(
  targetUserId?: string,
  limit = 30,
): Promise<StatusChangeLog[]> {
  try {
    await requireActiveOwner();
    const service = getSupabaseServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (service as any)
      .from('user_status_changes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (targetUserId) {
      query = query.eq('target_user_id', targetUserId);
    }

    const { data } = await query;
    if (!data) return [];

    const ids: string[] = (data as { target_user_id: string; changed_by: string | null }[])
      .flatMap((r) => [r.target_user_id, r.changed_by].filter(Boolean) as string[]);
    const unique = Array.from(new Set(ids));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: users } = unique.length > 0
      ? await (service as any).from('users').select('id, email').in('id', unique)
      : { data: [] };

    const emailMap = new Map(
      (users ?? []).map((u: { id: string; email: string }) => [u.id, u.email])
    );

    return (data as {
      id: string; target_user_id: string; changed_by: string | null;
      previous_active: boolean; new_active: boolean; reason: string | null; created_at: string;
    }[]).map((r) => ({
      id:              r.id,
      target_user_id:  r.target_user_id,
      target_email:    (emailMap.get(r.target_user_id) as string | null) ?? null,
      changed_by:      r.changed_by,
      changer_email:   r.changed_by ? ((emailMap.get(r.changed_by) as string | null) ?? null) : null,
      previous_active: r.previous_active,
      new_active:      r.new_active,
      reason:          r.reason,
      created_at:      r.created_at,
    }));
  } catch {
    return [];
  }
}

// ─── onboardNewUser ───────────────────────────────────────────────────────────
/**
 * Owner-initiated creation of a new company user with role='accountant'.
 * The new user receives a password-reset email so they can set their own password.
 */
export async function onboardNewUser(params: {
  email:    string;
  fullName: string;
}): Promise<StatusActionResult<{ userId: string }>> {
  const { email, fullName } = params;

  try {
    const { callerId, companyId } = await requireActiveOwner();
    const service = getSupabaseServiceClient();

    // Check if user already exists in this company
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (service as any)
      .from('users')
      .select('id, active')
      .eq('email', email.toLowerCase())
      .eq('company_id', companyId)
      .maybeSingle();

    if (existing) {
      return { ok: false, error: 'Użytkownik z tym adresem e-mail już istnieje w firmie.' };
    }

    // Create auth user (unconfirmed); trigger creates public.users with role=accountant
    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { full_name: fullName },
    });

    if (createErr || !created.user) {
      return { ok: false, error: createErr?.message ?? 'Nie udało się utworzyć konta.' };
    }

    // Link to company via service client (bypasses RLS)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any)
      .from('users')
      .update({ company_id: companyId, role: 'accountant', updated_at: new Date().toISOString() })
      .eq('id', created.user.id);

    // Write audit entry
    await writeStatusAuditLog({
      targetUserId:   created.user.id,
      changedBy:      callerId,
      previousActive: false,
      newActive:      true,
      reason:         `onboarded by owner as accountant`,
      ip:             null,
    });

    // Send password-reset email so user can set their own password
    const siteUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', 'vercel.app') ?? '';
    await service.auth.admin.generateLink({
      type:  'recovery',
      email,
      options: { redirectTo: `${siteUrl}/reset-password` },
    });

    return { ok: true, data: { userId: created.user.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}
