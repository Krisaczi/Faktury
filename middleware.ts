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
];

const AUTH_PATHS = ['/login', '/signup', '/forgot-password'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { supabaseResponse, user } = await updateSession(request);

  const isDemo = !!request.cookies.get(DEMO_COOKIE)?.value;

  const isPublicPath = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
  const isAuthPath = AUTH_PATHS.some((path) => pathname === path);
  const isOnboarding = pathname === '/onboarding';

  // Redirect authenticated users away from auth pages
  if (user && isAuthPath) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
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

  // Unauthenticated users cannot access onboarding
  if (!user && isOnboarding) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
