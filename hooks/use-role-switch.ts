'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { startRoleSwitch, revertRoleSwitch, getRoleSwitchStatus } from '@/lib/auth/role-switch-actions';
import type { AppRole } from '@/lib/permissions';

export interface RoleSwitchState {
  isActive:    boolean;
  assumedRole: AppRole | null;
  expiresAt:   Date | null;
}

const POLL_INTERVAL_MS = 15_000;

export function useRoleSwitch() {
  const [state, setState]              = useState<RoleSwitchState>({ isActive: false, assumedRole: null, expiresAt: null });
  const [isPending, startTransition]   = useTransition();
  const [error, setError]              = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const status = await getRoleSwitchStatus();
    setState({
      isActive:    status.isActive,
      assumedRole: status.assumedRole,
      expiresAt:   status.expiresAt ? new Date(status.expiresAt) : null,
    });
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const start = useCallback(
    (assumedRole: AppRole, durationMinutes: number, reason?: string) => {
      setError(null);
      startTransition(async () => {
        const res = await startRoleSwitch({ assumedRole, durationMinutes, reason });
        if (res.ok) {
          setState({ isActive: true, assumedRole: res.assumedRole, expiresAt: new Date(res.expiresAt) });
        } else {
          setError(res.error);
        }
      });
    },
    []
  );

  const revert = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const res = await revertRoleSwitch();
      if (res.ok) {
        setState({ isActive: false, assumedRole: null, expiresAt: null });
      } else {
        setError(res.error ?? 'Błąd cofania roli.');
      }
    });
  }, []);

  return { state, isPending, error, start, revert, refresh };
}
