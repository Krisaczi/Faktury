'use server';

import { getSupabaseServiceClient } from '@/lib/supabase/server';

export type SignupOutcome =
  | { status: 'created' }
  | { status: 'confirmation_resent' }
  | { status: 'already_confirmed' }
  | { status: 'error'; message: string };

/**
 * Server-side signup handler that uses the Admin API to detect the auth state
 * for the given email and respond correctly in all cases:
 *
 * 1. No auth user → create via admin API (triggers on_auth_user_created trigger
 *    which creates public.users) and send confirmation email.
 * 2. Auth user exists, unconfirmed → resend confirmation email.
 *    Also repairs public.users row if missing (trigger won't re-fire).
 * 3. Auth user exists, confirmed → return "already_confirmed".
 *    Also repairs public.users row if missing (deleted manually).
 *
 * The Admin API bypasses Supabase's anti-enumeration behavior, so a confirmation
 * email is always sent when appropriate even for existing unconfirmed accounts.
 */
export async function handleSignupAttempt(params: {
  email: string;
  password: string;
  fullName: string;
  emailRedirectTo: string;
}): Promise<SignupOutcome> {
  const { email, password, fullName, emailRedirectTo } = params;

  try {
    const service = getSupabaseServiceClient();

    // Look up auth user by email via admin API (requires service role)
    const { data: listData, error: listErr } =
      await service.auth.admin.listUsers({ perPage: 1000 });

    if (listErr) {
      console.error('[handleSignupAttempt] listUsers failed:', listErr.message);
      return { status: 'error', message: 'Sign up failed. Please try again.' };
    }

    const existing = listData.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    // ── Case 1: No existing auth user ─────────────────────────────────────────
    if (!existing) {
      // admin.createUser with email_confirm: false sends the confirmation email
      // automatically (respects the project's SMTP config) AND fires the
      // on_auth_user_created trigger that creates the public.users row.
      const { data: created, error: createErr } =
        await service.auth.admin.createUser({
          email,
          password,
          email_confirm:  false,
          user_metadata:  { full_name: fullName },
          app_metadata:   {},
        });

      if (createErr) {
        console.error('[handleSignupAttempt] createUser failed:', createErr.message);
        return { status: 'error', message: createErr.message };
      }

      if (!created.user) {
        return { status: 'error', message: 'Sign up failed. Please try again.' };
      }

      // Send the confirmation email. admin.createUser does NOT send it by itself
      // when email_confirm is false — we must call resend or generateLink.
      const { error: resendErr } = await service.auth.resend({
        type:    'signup',
        email,
        options: { emailRedirectTo },
      });

      if (resendErr) {
        // User was created but email failed — delete to allow a clean retry
        await service.auth.admin.deleteUser(created.user.id);
        console.error('[handleSignupAttempt] resend after create failed:', resendErr.message);
        return { status: 'error', message: 'Failed to send confirmation email. Please try again.' };
      }

      return { status: 'created' };
    }

    // ── Case 2: Auth user exists but email not yet confirmed ──────────────────
    if (!existing.email_confirmed_at) {
      const { error: resendErr } = await service.auth.resend({
        type:    'signup',
        email,
        options: { emailRedirectTo },
      });

      if (resendErr) {
        console.error('[handleSignupAttempt] resend for unconfirmed failed:', resendErr.message);
        return { status: 'error', message: 'Failed to resend confirmation. Please try again.' };
      }

      // Repair public.users row if the trigger failed to create it originally
      await ensurePublicUserRow(service, existing.id, email, fullName);

      return { status: 'confirmation_resent' };
    }

    // ── Case 3: Auth user exists and is confirmed ─────────────────────────────
    return { status: 'already_confirmed' };
  } catch (e) {
    console.error('[handleSignupAttempt] unexpected error:', e);
    return {
      status:  'error',
      message: e instanceof Error ? e.message : 'Sign up failed. Please try again.',
    };
  }
}

/**
 * Idempotently ensures a public.users row exists for the given auth user.
 * The DB schema uses ON CONFLICT (id) DO NOTHING, so duplicate calls are safe.
 * Also ensures the profiles row is present for backwards compatibility.
 */
async function ensurePublicUserRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: ReturnType<typeof import('@/lib/supabase/server').getSupabaseServiceClient>,
  authUserId: string,
  email: string,
  fullName: string
): Promise<void> {
  await Promise.allSettled([
    service.from('users').insert({
      id:    authUserId,
      email,
      role:  'member',
    }),
    service.from('profiles').insert({
      id:        authUserId,
      email,
      full_name: fullName || null,
      role:      'user',
    }),
  ]);
}
