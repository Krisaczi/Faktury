'use server';

import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase/server';

export type SignupOutcome =
  | { status: 'created' }
  | { status: 'confirmation_resent' }
  | { status: 'already_confirmed' }
  | { status: 'error'; message: string };

/**
 * Returns a Supabase client using the ANON key.
 * auth.resend() and auth.signUp() must use the anon key — the GoTrue
 * /auth/v1/resend endpoint rejects requests made with the service role key.
 */
function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * Server-side signup handler that uses the Admin API to detect the auth state
 * for the given email and respond correctly in all cases:
 *
 * 1. No auth user → create via admin API, then send confirmation email via
 *    anon client signUp (the only reliable server-side email trigger).
 * 2. Auth user exists, unconfirmed → resend confirmation via anon client.
 *    Also repairs public.users row if missing.
 * 3. Auth user exists, confirmed → return "already_confirmed".
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
    const anon    = getAnonClient();

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
      // signUp via anon client creates the user AND sends the confirmation email
      // in a single call — this is the reliable path for email delivery.
      const { data, error: signUpErr } = await anon.auth.signUp({
        email,
        password,
        options: {
          data:         { full_name: fullName },
          emailRedirectTo,
        },
      });

      if (signUpErr) {
        console.error('[handleSignupAttempt] signUp failed:', signUpErr.message);
        return { status: 'error', message: signUpErr.message };
      }

      if (!data.user) {
        return { status: 'error', message: 'Sign up failed. Please try again.' };
      }

      return { status: 'created' };
    }

    // ── Case 2: Auth user exists but email not yet confirmed ──────────────────
    if (!existing.email_confirmed_at) {
      // Update credentials in case the user is retrying with different values
      await service.auth.admin.updateUserById(existing.id, {
        password,
        user_metadata: { full_name: fullName },
      });

      // anon client resend triggers the confirmation email reliably
      const { error: resendErr } = await anon.auth.resend({
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingRow } = await (service as any)
      .from('users')
      .select('id')
      .eq('id', existing.id)
      .maybeSingle();

    if (!existingRow) {
      // Orphaned confirmed auth user — unconfirm and resend via anon client
      await service.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm:  false,
        user_metadata:  { full_name: fullName },
      });

      const { error: resendErr } = await anon.auth.resend({
        type:    'signup',
        email,
        options: { emailRedirectTo },
      });

      if (resendErr) {
        console.error('[handleSignupAttempt] resend for orphan failed:', resendErr.message);
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
