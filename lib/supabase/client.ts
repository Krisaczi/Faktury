'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { getAuthCookieOptions, REMEMBER_ME_COOKIE } from '@/lib/auth/cookie-options';

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;
let clientUrl: string | undefined;

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (client && clientUrl === url) return client;
  clientUrl = url;

  client = createBrowserClient<Database>(
    url!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          if (typeof document === 'undefined') return undefined;
          const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
          return match ? decodeURIComponent(match[1]) : undefined;
        },
        set(name, value, options) {
          if (typeof document === 'undefined') return;
          // Read the remember-me flag to decide cookie lifetime.
          // The login page sets this cookie before calling signInWithPassword.
          const rememberMe = document.cookie
            .split('; ')
            .find((c) => c.startsWith(`${REMEMBER_ME_COOKIE}=`))
            ?.split('=')[1] === '1';

          const opts = getAuthCookieOptions(rememberMe);
          const merged = { ...opts, ...options };

          let cookieStr = `${name}=${encodeURIComponent(value)}`;
          if (merged.path) cookieStr += `; path=${merged.path}`;
          if (merged.sameSite) cookieStr += `; samesite=${merged.sameSite}`;
          if (merged.maxAge) cookieStr += `; max-age=${merged.maxAge}`;
          if (merged.secure) cookieStr += `; secure`;
          // httpOnly cannot be set from document.cookie — the middleware handles
          // the authoritative HttpOnly cookies. This client-side set is a fallback
          // so the JS client can read its own session tokens during the initial
          // navigation before the server cookies arrive.
          document.cookie = cookieStr;
        },
        remove(name, options) {
          if (typeof document === 'undefined') return;
          const opts = { path: '/', ...options };
          document.cookie = `${name}=; path=${opts.path}; max-age=0`;
        },
      },
    }
  );

  return client;
}
