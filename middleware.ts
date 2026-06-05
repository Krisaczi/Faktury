import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const DEMO_COOKIE = 'rg_demo_session';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/pricing',
  '/demo',
  '/api/demo',
  '/account-inactive',
];

const AUTH_PATHS = ['/login', '/signup', '/forgot-password'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { supabaseResponse, user, supabase } = await updateSession(request);

  const isDemo = !!request.cookies.get(DEMO_COOKIE)?.value;

  const isPublicPath = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
  const isAuthPath = AUTH_PATHS.some((path) => pathname === path);
  const isOnboarding = pathname === '/onboarding';

  // Redirect authenticated users away from auth pages to dashboard.
  const isServerAction = !!request.headers.get('next-action');
  if (user && isAuthPath && !isServerAction) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (user && isOnboarding) {
    return supabaseResponse;
  }

  // Demo sessions bypass auth requirement for protected routes
  if (isDemo && !isAuthPath) {
    return supabaseResponse;
  }

  // Redirect unauthenticated users trying to access protected routes
  if (!user && !isPublicPath && !isOnboarding) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (!user && isOnboarding) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // ── Active flag check for authenticated, non-public, non-demo routes ────────
  // Skip API routes (they do their own auth) and the inactive page itself.
  if (
    user &&
    !isPublicPath &&
    !isOnboarding &&
    !isDemo &&
    !pathname.startsWith('/api/') &&
    !isServerAction
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userRow } = await (supabase as any)
      .from('users')
      .select('active')
      .eq('id', user.id)
      .maybeSingle();

    // If the row exists and active is explicitly false, block access.
    // If the row is missing (onboarding not complete), let the page handle it.
    if (userRow && userRow.active === false) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL('/account-inactive', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
