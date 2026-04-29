import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
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
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const publicPaths = ['/login', '/pricing', '/terms', '/privacy', '/auth/callback', '/demo'];
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user) {
    if (pathname === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith('/onboarding') || isPublicPath) {
      return supabaseResponse;
    }

    const { data: userRecord } = await supabase
      .from('users')
      .select('onboarded, company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (pathname.startsWith('/admin')) {
      if (userRecord?.role !== 'admin') {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }

    const needsOnboarding = !userRecord?.onboarded || !userRecord?.company_id;

    if (needsOnboarding && !pathname.startsWith('/onboarding')) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      return NextResponse.redirect(url);
    }

    if (userRecord?.company_id) {
      const { data: company } = await supabase
        .from('companies')
        .select('trial_end, subscription_status')
        .eq('id', userRecord.company_id)
        .maybeSingle();

      if (company) {
        const isActive = company.subscription_status === 'active';
        const isTrialActive =
          company.trial_end && new Date() < new Date(company.trial_end);

        if (!isActive && !isTrialActive) {
          const url = request.nextUrl.clone();
          url.pathname = '/pricing';
          url.searchParams.set(
            'message',
            'Your 7-day free trial has ended. Please subscribe to continue.'
          );
          return NextResponse.redirect(url);
        }
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
