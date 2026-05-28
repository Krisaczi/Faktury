'use server';

import { resolveUserContext } from '@/lib/auth/resolve-user-context';
import { determinePostLoginRedirect } from '@/lib/auth/determine-post-login-redirect';

/**
 * Server action called after the browser client completes signInWithPassword.
 * Reads the now-established session from cookies and returns the correct redirect path.
 */
export async function getPostLoginRedirect(next?: string | null): Promise<string> {
  const userContext = await resolveUserContext();

  if (!userContext) {
    // Session not readable yet — safe fallback
    return '/login';
  }

  const destination = determinePostLoginRedirect({ userContext, next });

  if (process.env.NODE_ENV !== 'production') {
    console.log('[post-login-redirect]', {
      uid: userContext.id,
      role: userContext.role,
      onboardingCompleted: userContext.onboardingCompleted,
      next,
      destination,
    });
  }

  return destination;
}
