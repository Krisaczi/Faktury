'use client';

import { AlertTriangle, Loader as Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CEIDG_STATUS_LABEL,
  isCeidgStatusBlocking,
  type CeidgStatus,
} from '@/lib/ceidg/ceidg-company';
import type { CeidgLookupState } from '@/hooks/use-ceidg-lookup';

const CEIDG_BADGE_CLASS: Record<CeidgStatus, string> = {
  active:    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  suspended: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  deleted:   'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  inactive:  'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

interface CeidgLookupStatusProps {
  nip: string;
  lookupState: CeidgLookupState;
  status: CeidgStatus | null;
  onLookup: (nip: string) => void;
}

export function CeidgLookupStatus({ nip, lookupState, status, onLookup }: CeidgLookupStatusProps) {
  return (
    <div className="flex flex-col gap-2">
      {nip.length === 10 && lookupState.phase !== 'loading' && (
        <Button type="button" variant="outline" size="sm" onClick={() => onLookup(nip)} className="self-start gap-2">
          <Search className="w-3.5 h-3.5" />
          Pobierz z CEIDG
        </Button>
      )}
      {lookupState.phase === 'loading' && (
        <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Sprawdzanie w CEIDG...
        </p>
      )}
      {lookupState.phase === 'error' && (
        <p className="text-xs text-red-500">{lookupState.message}</p>
      )}
      {status && (
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold', CEIDG_BADGE_CLASS[status])}>
            {CEIDG_STATUS_LABEL[status]}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">Status w CEIDG</span>
        </div>
      )}
    </div>
  );
}

interface CeidgBlockingWarningProps {
  status: CeidgStatus | null;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}

export function CeidgBlockingWarning({ status, acknowledged, onAcknowledge }: CeidgBlockingWarningProps) {
  if (!status || !isCeidgStatusBlocking(status)) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-3 space-y-2">
      <p className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
        <AlertTriangle className="w-4 h-4" />
        Firma ma status „{CEIDG_STATUS_LABEL[status]}” w CEIDG.
      </p>
      <label className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => onAcknowledge(e.target.checked)}
          className="h-4 w-4 rounded border-amber-400"
        />
        Rozumiem i chcę zapisać tego klienta mimo to
      </label>
    </div>
  );
}
