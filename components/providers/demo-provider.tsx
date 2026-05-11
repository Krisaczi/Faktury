'use client';

import * as React from 'react';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DemoStatus {
  isDemo:           boolean;
  demoSessionId:    string | null;
  expiresAt:        string | null;
  remainingMinutes: number | null;
  seedPreset:       'small' | 'full' | null;
  expired:          boolean;
}

interface DemoContextValue {
  status:      DemoStatus;
  isLoading:   boolean;
  exitDemo:    () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const DemoContext = createContext<DemoContextValue | null>(null);

const DEFAULT_STATUS: DemoStatus = {
  isDemo:           false,
  demoSessionId:    null,
  expiresAt:        null,
  remainingMinutes: null,
  seedPreset:       null,
  expired:          false,
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const router                          = useRouter();
  const [status,    setStatus]          = useState<DemoStatus>(DEFAULT_STATUS);
  const [isLoading, setIsLoading]       = useState(true);
  const intervalRef                     = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res  = await fetch('/api/demo/status', { cache: 'no-store' });
      const data = await res.json() as DemoStatus & { expired?: boolean };
      setStatus({
        isDemo:           data.isDemo ?? false,
        demoSessionId:    data.demoSessionId ?? null,
        expiresAt:        data.expiresAt ?? null,
        remainingMinutes: data.remainingMinutes ?? null,
        seedPreset:       (data.seedPreset as 'small' | 'full') ?? null,
        expired:          data.expired ?? false,
      });
    } catch {
      // Network error — keep current state
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Poll every 60 s while demo is active to update remaining time
  useEffect(() => {
    void fetchStatus();

    intervalRef.current = setInterval(() => {
      void fetchStatus();
    }, 60_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  const exitDemo = useCallback(async () => {
    try {
      await fetch('/api/demo/disable', { method: 'POST' });
    } finally {
      setStatus(DEFAULT_STATUS);
      router.push('/login');
    }
  }, [router]);

  return (
    <DemoContext.Provider value={{ status, isLoading, exitDemo, refreshStatus: fetchStatus }}>
      {children}
    </DemoContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDemoMode(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemoMode must be used within DemoProvider');
  return ctx;
}
