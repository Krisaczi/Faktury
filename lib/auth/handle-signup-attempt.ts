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
 * 1. No auth user → create via admin API and send confirmation email via
 *    generateLink (the only reliable server-side method).
 * 2. Auth user exists, unconfirmed → resend confirmation via generateLink.
 *    Also repairs public.users row if missing (trigger won't re-fire).
 * 3. Auth user exists, confirmed → return "already_confirmed".
 *    Also repairs public.users row if missing (deleted manually).
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

      // generateLink is the reliable server-side way to send a confirmation email.
      // It uses Supabase's configured SMTP and honours the redirectTo option.
      // Note: type 'signup' requires password per the Admin API contract.
      const { error: linkErr } = await service.auth.admin.generateLink({
        type:     'signup',
        email,
        password,
        options:  { redirectTo: emailRedirectTo },
      });

      if (linkErr) {
        // User was created but email failed — delete to allow a clean retry
        await service.auth.admin.deleteUser(created.user.id);
        console.error('[handleSignupAttempt] generateLink after create failed:', linkErr.message);
        return { status: 'error', message: 'Failed to send confirmation email. Please try again.' };
      }

      return { status: 'created' };
    }

    // ── Case 2: Auth user exists but email not yet confirmed ──────────────────
    if (!existing.email_confirmed_at) {
      // Update password in case the user is retrying with different credentials
      await service.auth.admin.updateUserById(existing.id, {
        password,
        user_metadata: { full_name: fullName },
      });

      const { error: linkErr } = await service.auth.admin.generateLink({
        type:     'signup',
        email,
        password,
        options:  { redirectTo: emailRedirectTo },
      });

      if (linkErr) {
        console.error('[handleSignupAttempt] generateLink for unconfirmed failed:', linkErr.message);
        return { status: 'error', message: 'Failed to resend confirmation. Please try again.' };
      }

      // Repair public.users row if the trigger failed to create it originally
      await ensurePublicUserRow(service, existing.id, email, fullName);

      return { status: 'confirmation_resent' };
    }

    // ── Case 3: Auth user exists and is confirmed ─────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingRow } = await (service as any)
      .from('users')
      .select('id')
      .eq('id', existing.id)
      .maybeSingle();

    if (!existingRow) {
      // Orphaned confirmed auth user — unconfirm so they go through verification again.
      await service.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm:  false,
        user_metadata:  { full_name: fullName },
      });

      const { error: linkErr } = await service.auth.admin.generateLink({
        type:     'signup',
        email,
        password,
        options:  { redirectTo: emailRedirectTo },
      });

      if (linkErr) {
        console.error('[handleSignupAttempt] generateLink for orphan failed:', linkErr.message);
        // Password was updated — let them sign in directly
        return { status: 'already_confirmed' };
      }

      return { status: 'created' };
    }

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
 */
async function ensurePublicUserRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: ReturnType<typeof import('@/lib/supabase/server').getSupabaseServiceClient>,
  authUserId: string,
  email: string,
  fullName: string
): Promise<void> {
  await Promise.allSettled([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).from('users').insert({
      id:    authUserId,
      email,
      role:  'accountant',
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).from('profiles').insert({
      id:        authUserId,
      email,
      full_name: fullName || null,
      role:      'user',
    }),
  ]);
}
