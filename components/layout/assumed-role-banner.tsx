'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, X, Loader } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLE_LABELS, type AppRole } from '@/lib/permissions';
import { useRoleSwitch } from '@/hooks/use-role-switch';

function formatCountdown(expiresAt: Date): string {
  const diff = Math.max(0, expiresAt.getTime() - Date.now());
  const totalSecs = Math.floor(diff / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0
    ? `${pad(h)}:${pad(m)}:${pad(s)}`
    : `${pad(m)}:${pad(s)}`;
}

const ROLE_ACCENT: Record<AppRole, string> = {
  admin:      'bg-blue-600   border-blue-500',
  accountant: 'bg-emerald-600 border-emerald-500',
  owner:      'bg-amber-600  border-amber-500',
};

export function AssumedRoleBanner() {
  const { state, isPending, revert } = useRoleSwitch();
  const [countdown, setCountdown]   = useState('');

  useEffect(() => {
    if (!state.isActive || !state.expiresAt) { setCountdown(''); return; }
    setCountdown(formatCountdown(state.expiresAt));
    const id = setInterval(() => {
      if (!state.expiresAt) return;
      setCountdown(formatCountdown(state.expiresAt));
    }, 1000);
    return () => clearInterval(id);
  }, [state.isActive, state.expiresAt]);

  if (!state.isActive || !state.assumedRole) return null;

  const accent = ROLE_ACCENT[state.assumedRole] ?? ROLE_ACCENT.accountant;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-2 text-white text-xs font-medium border-b flex-shrink-0',
        accent
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
        <span>
          Przeglądasz jako: <strong>{ROLE_LABELS[state.assumedRole]}</strong>
          {countdown && (
            <span className="ml-2 opacity-80 tabular-nums">
              — wygasa za {countdown}
            </span>
          )}
        </span>
      </div>
      <button
        onClick={revert}
        disabled={isPending}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 transition-colors text-white text-xs font-semibold"
        aria-label="Cofnij zmianę roli"
      >
        {isPending
          ? <Loader className="w-3 h-3 animate-spin" />
          : <X className="w-3 h-3" />}
        Cofnij
      </button>
    </div>
  );
}
