'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { ROLE_SWITCH_COOKIE } from '@/lib/auth/get-effective-role';
import type { AppRole } from '@/lib/permissions';

const ALLOWED_ASSUMED_ROLES: AppRole[] = ['admin', 'accountant', 'viewer'];
const DEFAULT_DURATION_MINUTES = 30;
const MAX_DURATION_MINUTES = 120;

export type RoleSwitchResult =
  | { ok: true;  expiresAt: string; assumedRole: AppRole }
  | { ok: false; error: string };

// ─── startRoleSwitch ──────────────────────────────────────────────────────────

export async function startRoleSwitch(params: {
  assumedRole:     AppRole;
  durationMinutes?: number;
  reason?:         string;
}): Promise<RoleSwitchResult> {
  const { assumedRole, durationMinutes = DEFAULT_DURATION_MINUTES, reason } = params;

  if (!ALLOWED_ASSUMED_ROLES.includes(assumedRole)) {
    return { ok: false, error: `Rola "${assumedRole}" nie jest dozwolona do przełączenia.` };
  }

  const clampedDuration = Math.min(Math.max(durationMinutes, 1), MAX_DURATION_MINUTES);

  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Brak uwierzytelnienia.' };

    const { data: userRow } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (userRow?.role !== 'owner') {
      return { ok: false, error: 'Tylko właściciel może przełączać role.' };
    }

    const expiresAt = new Date(Date.now() + clampedDuration * 60 * 1000);

    // Insert the audit log row first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: logRow, error: logErr } = await (supabase as any)
      .from('role_switch_logs')
      .insert({
        owner_id:      user.id,
        assumed_role:  assumedRole,
        previous_role: 'owner',
        reason:        reason || null,
        started_at:    new Date().toISOString(),
        expires_at:    expiresAt.toISOString(),
      })
      .select('id')
      .single();

    if (logErr || !logRow) {
      return { ok: false, error: logErr?.message ?? 'Błąd zapisu dziennika.' };
    }

    // Revoke any existing session for this owner first (idempotent)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('role_switch_sessions')
      .delete()
      .eq('owner_id', user.id);

    // Create the ephemeral session row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sessionRow, error: sessionErr } = await (supabase as any)
      .from('role_switch_sessions')
      .insert({
        owner_id:     user.id,
        assumed_role: assumedRole,
        log_id:       logRow.id,
        expires_at:   expiresAt.toISOString(),
      })
      .select('token')
      .single();

    if (sessionErr || !sessionRow) {
      return { ok: false, error: sessionErr?.message ?? 'Błąd tworzenia sesji.' };
    }

    // Set HttpOnly cookie
    const cookieStore = await cookies();
    cookieStore.set(ROLE_SWITCH_COOKIE, sessionRow.token as string, {
      httpOnly:  true,
      secure:    process.env.NODE_ENV === 'production',
      sameSite:  'strict',
      path:      '/',
      expires:   expiresAt,
    });

    revalidatePath('/');
    return { ok: true, expiresAt: expiresAt.toISOString(), assumedRole };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── revertRoleSwitch ─────────────────────────────────────────────────────────

export async function revertRoleSwitch(): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Brak uwierzytelnienia.' };

    const cookieStore = await cookies();
    const rawToken = cookieStore.get(ROLE_SWITCH_COOKIE)?.value;

    if (rawToken) {
      // Find session to get the log_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: session } = await (supabase as any)
        .from('role_switch_sessions')
        .select('token, log_id')
        .eq('token', rawToken)
        .eq('owner_id', user.id)
        .maybeSingle();

      // Delete the session row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('role_switch_sessions')
        .delete()
        .eq('token', rawToken);

      // Mark the log entry as reverted
      if (session?.log_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('role_switch_logs')
          .update({ reverted_at: new Date().toISOString(), revoked_by: user.id })
          .eq('id', session.log_id)
          .is('reverted_at', null);
      }

      // Clear the cookie
      cookieStore.set(ROLE_SWITCH_COOKIE, '', {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path:     '/',
        maxAge:   0,
      });
    }

    revalidatePath('/');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── getRoleSwitchStatus ──────────────────────────────────────────────────────
// Lightweight server action for the client to poll current switch state.

export interface RoleSwitchStatus {
  isActive:    boolean;
  assumedRole: AppRole | null;
  expiresAt:   string | null;
}

export async function getRoleSwitchStatus(): Promise<RoleSwitchStatus> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { isActive: false, assumedRole: null, expiresAt: null };

    const cookieStore = await cookies();
    const rawToken = cookieStore.get(ROLE_SWITCH_COOKIE)?.value;
    if (!rawToken) return { isActive: false, assumedRole: null, expiresAt: null };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: session } = await (supabase as any)
      .from('role_switch_sessions')
      .select('assumed_role, expires_at')
      .eq('token', rawToken)
      .eq('owner_id', user.id)
      .maybeSingle();

    if (!session) return { isActive: false, assumedRole: null, expiresAt: null };
    if (new Date(session.expires_at) <= new Date()) return { isActive: false, assumedRole: null, expiresAt: null };

    return {
      isActive:    true,
      assumedRole: session.assumed_role as AppRole,
      expiresAt:   session.expires_at as string,
    };
  } catch {
    return { isActive: false, assumedRole: null, expiresAt: null };
  }
}
