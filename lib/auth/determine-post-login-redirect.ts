import type { AppRole } from '@/lib/permissions';
import type { UserContext } from './resolve-user-context';

/**
 * Returns true for internal paths that are safe to redirect to.
 * Blocks absolute URLs, protocol-relative URLs, and empty strings.
 */
export function isSafeRedirect(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  // Must start with a single slash but not double-slash (protocol-relative)
  if (!url.startsWith('/') || url.startsWith('//')) return false;
  // Block auth and onboarding pages as post-login destinations
  const blocked = ['/login', '/signup', '/onboarding', '/forgot-password', '/reset-password'];
  if (blocked.some((p) => url === p || url.startsWith(`${p}/`) || url.startsWith(`${p}?`))) return false;
  return true;
}

const ROLE_DEFAULT_PATHS: Record<AppRole, string> = {
  owner:      '/dashboard',
  admin:      '/dashboard',
  accountant: '/dashboard',
};

/**
 * Determines the correct post-login redirect path.
 *
 * Priority:
 *   1. Onboarding not completed → /onboarding
 *   2. Safe `next` param provided → next
 *   3. Role-based default
 */
export function determinePostLoginRedirect(params: {
  userContext: UserContext;
  next?: string | null;
}): string {
  const { userContext, next } = params;

  if (!userContext.onboardingCompleted) {
    return '/onboarding';
  }

  if (next && isSafeRedirect(next)) {
    return next;
  }

  return ROLE_DEFAULT_PATHS[userContext.role] ?? '/dashboard';
}
