import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import { getAuthCookieOptions, isRememberMe } from '@/lib/auth/cookie-options';

export function getSupabaseServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    return createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { persistSession: false } }
    );
  }
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const rememberMe = isRememberMe(cookieStore.getAll());
  const cookieOpts = getAuthCookieOptions(rememberMe);

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...cookieOpts,
                ...options,
                maxAge: options.maxAge ?? cookieOpts.maxAge,
              })
            );
          } catch {
            // Server Component — mutations are handled by middleware
          }
        },
      },
    }
  );
}
