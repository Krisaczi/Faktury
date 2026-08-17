'use client';

import { useState } from 'react';
import { Building2, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, Copy, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CustomerAuditEntry } from './actions';

const EVENT_CONFIG = {
  created: {
    label:  'Utworzono',
    icon:   CheckCircle2,
    color:  'text-emerald-600 dark:text-emerald-400',
    badge:  'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  validation_failed: {
    label:  'Błąd walidacji',
    icon:   AlertTriangle,
    color:  'text-amber-600 dark:text-amber-400',
    badge:  'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  duplicate_blocked: {
    label:  'Zablokowano duplikat',
    icon:   Copy,
    color:  'text-red-600 dark:text-red-400',
    badge:  'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  },
} as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pl-PL', {
    day:     '2-digit',
    month:   'short',
    year:    'numeric',
    hour:    '2-digit',
    minute:  '2-digit',
  });
}

export function CustomerAuditClient({
  initialRows,
  totalCount,
}: {
  initialRows: CustomerAuditEntry[];
  totalCount: number;
}) {
  const [selected, setSelected] = useState<CustomerAuditEntry | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          Łącznie zdarzeń: <span className="font-semibold text-slate-700 dark:text-slate-300">{totalCount}</span>
        </p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Odśwież
        </button>
      </div>

      {initialRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">
            Brak zdarzeń. Zdarzenia tworzenia klientów i błędów walidacji pojawią się tutaj.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {initialRows.map((entry) => {
            const cfg = EVENT_CONFIG[entry.event_type];
            const Icon = cfg.icon;

            return (
              <button
                key={entry.id}
                onClick={() => setSelected(entry)}
                className="w-full flex items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-left hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center justify-center shrink-0">
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={cfg.badge}>
                      {cfg.label}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      {formatDate(entry.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
                    {entry.customer_name ?? '—'}
                    {entry.customer_nip && (
                      <span className="text-slate-400 ml-2 font-mono">NIP: {entry.customer_nip}</span>
                    )}
                  </p>
                  {entry.user_email && (
                    <p className="text-xs text-slate-400 mt-0.5">{entry.user_email}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-blue-600" />
              Szczegóły zdarzenia
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-3 py-2">
              <DetailRow label="Typ zdarzenia" value={EVENT_CONFIG[selected.event_type].label} />
              <DetailRow label="Klient" value={selected.customer_name ?? '—'} />
              <DetailRow label="NIP" value={selected.customer_nip ?? '—'} mono />
              <DetailRow label="Użytkownik" value={selected.user_email ?? '—'} />
              <DetailRow label="Data" value={formatDate(selected.created_at)} />
              {selected.error_detail && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                    Szczegóły błędu
                  </p>
                  <pre className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {selected.error_detail}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide shrink-0">
        {label}
      </span>
      <span className={`text-sm text-slate-700 dark:text-slate-300 text-right ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}
