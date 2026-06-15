'use server';

import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase/server';

export type SignupOutcome =
  | { status: 'created' }
  | { status: 'confirmation_resent' }
  | { status: 'already_confirmed' }
  | { status: 'error'; message: string };

function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * Handles signup in three cases without requiring listUsers (no service role
 * needed for the happy path):
 *
 * 1. New email → signUp creates the user and sends confirmation email.
 * 2. Email exists, unconfirmed → signUp returns identities:[] → resend email.
 * 3. Email exists, confirmed → signUp returns identities:[] and user has
 *    email_confirmed_at → tell the user to sign in instead.
 */
export async function handleSignupAttempt(params: {
  email: string;
  password: string;
  fullName: string;
  emailRedirectTo: string;
}): Promise<SignupOutcome> {
  const { email, password, fullName, emailRedirectTo } = params;

  try {
    const anon = getAnonClient();

    const { data, error: signUpErr } = await anon.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo,
      },
    });

    if (signUpErr) {
      console.error('[handleSignupAttempt] signUp error:', signUpErr.message);
      return { status: 'error', message: signUpErr.message };
    }

    if (!data.user) {
      console.error('[handleSignupAttempt] signUp returned no user');
      return { status: 'error', message: 'Sign up failed. Please try again.' };
    }

    // When the email already exists Supabase returns the user object but with
    // an empty identities array (it doesn't reveal whether it's confirmed or
    // not for security reasons — we check email_confirmed_at to distinguish).
    const identities = data.user.identities ?? [];
    if (identities.length === 0) {
      if (data.user.email_confirmed_at) {
        // Confirmed — user should sign in or reset their password
        return { status: 'already_confirmed' };
      }

      // Unconfirmed — resend the confirmation email
      const { error: resendErr } = await anon.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo },
      });

      if (resendErr) {
        console.error('[handleSignupAttempt] resend error:', resendErr.message);
        return { status: 'error', message: 'Failed to resend confirmation email. Please try again.' };
      }

      // Update credentials so the new password works when they confirm
      try {
        const service = getSupabaseServiceClient();
        await service.auth.admin.updateUserById(data.user.id, {
          password,
          user_metadata: { full_name: fullName },
        });
      } catch (e) {
        // Non-fatal — credentials update is best-effort
        console.warn('[handleSignupAttempt] credential update failed:', e);
      }

      return { status: 'confirmation_resent' };
    }

    // New user — email confirmation sent by signUp
    return { status: 'created' };
  } catch (e) {
    console.error('[handleSignupAttempt] unexpected error:', e);
    return {
      status: 'error',
      message: e instanceof Error ? e.message : 'Sign up failed. Please try again.',
    };
  }
}
