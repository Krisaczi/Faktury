import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';
import { getAuthCookieOptions, isRememberMe } from '@/lib/auth/cookie-options';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const rememberMe = isRememberMe(request.cookies.getAll());

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });

          const cookieOpts = getAuthCookieOptions(rememberMe);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...cookieOpts,
              ...options,
              // Always keep our maxAge decision authoritative — if rememberMe
              // is false, we must NOT let Supabase's default 7-day maxAge through.
              maxAge: options.maxAge ?? cookieOpts.maxAge,
            })
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user, supabase };
}
