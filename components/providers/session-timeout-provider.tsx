'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { SESSION_TIMEOUT_MS } from '@/lib/auth/cookie-options';

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousedown',
  'keydown',
  'mousemove',
  'touchstart',
  'scroll',
  'wheel',
];

/**
 * Tracks user activity and automatically logs out after a period of
 * inactivity (default: 60 minutes). On logout, redirects to /login
 * with ?expired=1 so the login page can show the "session expired" message.
 *
 * Only active on protected routes — the provider should be mounted
 * inside the authenticated app layout.
 */
export function SessionTimeoutProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const lastActivityRef = useRef<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const checkTimeout = useCallback(async () => {
    const elapsed = Date.now() - lastActivityRef.current;
    if (elapsed >= SESSION_TIMEOUT_MS) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();

      router.push('/login?expired=1');
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    // Initialize last activity on mount
    lastActivityRef.current = Date.now();

    // Throttled activity listener — we don't need to update on every mousemove,
    // just enough to keep the timestamp fresh.
    let throttleTimeout: ReturnType<typeof setTimeout> | null = null;

    function onActivity() {
      if (throttleTimeout) return;
      throttleTimeout = setTimeout(() => {
        resetTimer();
        throttleTimeout = null;
      }, 5000);
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    // Check every 30 seconds
    intervalRef.current = setInterval(checkTimeout, 30_000);

    // Also check on focus (e.g. returning to the tab after a while)
    function onFocus() {
      checkTimeout();
    }
    window.addEventListener('focus', onFocus);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      window.removeEventListener('focus', onFocus);
      if (throttleTimeout) clearTimeout(throttleTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [resetTimer, checkTimeout]);

  return <>{children}</>;
}
