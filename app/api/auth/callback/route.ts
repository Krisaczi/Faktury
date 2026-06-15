import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

/**
 * Handles Supabase auth callbacks for email confirmation and password reset.
 *
 * Supabase redirects here after the user clicks a confirmation or reset link.
 * The URL will contain one of:
 *   - ?code=...          PKCE auth code (default for newer Supabase projects)
 *   - ?token_hash=...&type=...  OTP hash (alternative email format)
 *
 * After a successful exchange the user is redirected to:
 *   - /verify-email?verified=1  for email confirmations
 *   - /reset-password           for password resets
 *   - /verify-email?error=...   on failure
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'email' | 'recovery' | 'signup' | null;

  const isRecovery = type === 'recovery';
  const successUrl = isRecovery
    ? new URL('/reset-password', origin)
    : new URL('/verify-email?verified=1', origin);

  // Collect cookies to set on the redirect response
  const cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(items) {
          items.forEach(({ name, value, options }) => {
            cookiesToSet.push({ name, value, options });
          });
        },
      },
    }
  );

  let authError: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) authError = error.message;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) authError = error.message;
  } else {
    // No token params — might be implicit flow (#access_token) which can't
    // be read server-side. Redirect to verify-email and let the client handle it.
    return NextResponse.redirect(new URL('/verify-email', origin));
  }

  if (authError) {
    console.error('[auth/callback] auth error:', authError);
    return NextResponse.redirect(
      new URL(`/verify-email?error=${encodeURIComponent(authError)}`, origin)
    );
  }

  const response = NextResponse.redirect(successUrl);
  cookiesToSet.forEach(({ name, value, options }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response.cookies.set(name, value, options as any);
  });
  return response;
}
