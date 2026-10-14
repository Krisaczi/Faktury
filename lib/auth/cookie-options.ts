import type { CookieOptions } from '@supabase/ssr';

export const REMEMBER_ME_COOKIE = 'bf_remember_me';

export const SESSION_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * Returns cookie options for Supabase auth tokens.
 *
 * When "Remember Me" is NOT checked, cookies are session-scoped:
 * no maxAge/expiry is set, so the browser deletes them when the
 * tab or window closes.
 *
 * When "Remember Me" IS checked, cookies persist for 7 days
 * (matching the Supabase JWT default lifetime).
 */
export function getAuthCookieOptions(rememberMe: boolean): CookieOptions {
  const base: CookieOptions = {
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };

  if (rememberMe) {
    return { ...base, maxAge: 60 * 60 * 24 * 7 };
  }

  // Session-only: no maxAge means the browser discards the cookie on close.
  return base;
}

/**
 * Reads the remember-me flag from a cookie name→value map.
 * Returns true if the user checked "Remember Me" at login.
 */
export function isRememberMe(cookies: { get: (name: string) => string | undefined } | Array<{ name: string; value: string }>): boolean {
  if (Array.isArray(cookies)) {
    const found = cookies.find((c) => c.name === REMEMBER_ME_COOKIE);
    return found?.value === '1';
  }
  return cookies.get(REMEMBER_ME_COOKIE) === '1';
}
