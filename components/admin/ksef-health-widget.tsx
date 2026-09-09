'use client';

import { useState, useTransition, useEffect } from 'react';
import { AlertTriangle, Clock, CheckCircle, XCircle, RefreshCw, Loader as Loader2, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface KsefHealthData {
  counts: {
    queued:    number;
    failed:    number;
    rejected:  number;
    submitted: number;
    accepted:  number;
  };
  queueLength: number;
  attentionInvoices: Array<{
    id:            string;
    invoiceNumber: string | null;
    ksefStatus:    string;
    ksefNumber:    string | null;
    lastAttemptAt: string | null;
    companyName:   string | null;
    totalCents:    number;
  }>;
  recentAudit: Array<{
    id:            string;
    invoiceId:     string;
    attemptResult: string;
    errorMessage:  string | null;
    correlationId: string | null;
    createdAt:     string;
  }>;
}

function formatCents(c: number): string {
  return `${(c / 100).toFixed(2)} zł`;
}

const STATUS_STYLES: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  queued:    { label: 'W kolejce',   className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400',    icon: <Clock className="w-3 h-3" /> },
  failed:    { label: 'Błąd',        className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400',              icon: <XCircle className="w-3 h-3" /> },
  rejected:  { label: 'Odrzucono',   className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400',              icon: <XCircle className="w-3 h-3" /> },
  submitted: { label: 'Przesłano',   className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400', icon: <CheckCircle className="w-3 h-3" /> },
  accepted:  { label: 'Zaakceptowano', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400', icon: <CheckCircle className="w-3 h-3" /> },
};

export function KsefHealthWidget({ onResubmit }: { onResubmit?: (invoiceIds: string[]) => void }) {
  const [data, setData] = useState<KsefHealthData | null>(null);
  const [isPending, start] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  function loadHealth() {
    start(async () => {
      try {
        const res = await fetch('/api/owner/invoices/ksef-health');
        if (res.ok) {
          const healthData = await res.json() as KsefHealthData;
          setData(healthData);
        }
      } catch {
        // silent fail
      }
    });
  }

  useEffect(() => { loadHealth(); }, []);

  if (!data) return null;

  const needsAttention = data.counts.queued + data.counts.failed + data.counts.rejected;
  if (needsAttention === 0 && data.counts.accepted > 0) return null;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === data!.attentionInvoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data!.attentionInvoices.map((inv) => inv.id)));
    }
  }

  function handleBulkResubmit() {
    if (selectedIds.size === 0) return;
    const invoiceIds = Array.from(selectedIds);
    setActionMessage(null);

    if (onResubmit) {
      onResubmit(invoiceIds);
      setSelectedIds(new Set());
      return;
    }

    start(async () => {
      try {
        const res = await fetch('/api/owner/invoices/bulk-send-to-ksef', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceIds }),
        });
        const result = await res.json().catch(() => ({ error: 'Błąd wysyłki.' })) as {
          error?: string;
          summary?: { succeeded: number; failed: number; queued: number };
        };
        if (!res.ok || !result.summary) {
          setActionMessage(result.error ?? 'Błąd zbiorczej wysyłki KSeF.');
          return;
        }
        const { succeeded, failed, queued } = result.summary;
        setActionMessage(`Wysłano: ${succeeded}, w kolejce: ${queued}, błędy: ${failed}.`);
        setSelectedIds(new Set());
        loadHealth();
      } catch {
        setActionMessage('Błąd połączenia z KSeF.');
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Status KSeF
          </h2>
          {needsAttention > 0 && (
            <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 text-xs">
              {needsAttention} wymaga uwagi
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={loadHealth} disabled={isPending} className="h-7 text-xs gap-1">
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Odśwież
        </Button>
      </div>

      {actionMessage && (
        <div className="px-4 py-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900">
          {actionMessage}
        </div>
      )}

      {/* Status summary cards */}
      <div className="grid grid-cols-5 gap-2 p-4">
        {(['accepted', 'submitted', 'queued', 'rejected', 'failed'] as const).map((status) => {
          const cfg = STATUS_STYLES[status];
          const count = data.counts[status] ?? 0;
          return (
            <div key={status} className="text-center">
              <div className="flex items-center justify-center mb-1">{cfg.icon}</div>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{count}</p>
              <p className="text-xs text-slate-400">{cfg.label}</p>
            </div>
          );
        })}
      </div>

      {/* Attention invoices list */}
      {data.attentionInvoices.length > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between px-4 py-2 bg-slate-50/30 dark:bg-slate-800/20">
            <button
              onClick={selectAll}
              className="text-xs text-blue-600 hover:underline"
            >
              {selectedIds.size === data.attentionInvoices.length ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
            </button>
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                onClick={handleBulkResubmit}
                disabled={isPending}
                className="h-7 text-xs gap-1"
              >
                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Wyślij ponownie ({selectedIds.size})
              </Button>
            )}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
            {data.attentionInvoices.map((inv) => {
              const cfg = STATUS_STYLES[inv.ksefStatus] ?? STATUS_STYLES.queued;
              return (
                <label
                  key={inv.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(inv.id)}
                    onChange={() => toggleSelect(inv.id)}
                    className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                        {inv.invoiceNumber ?? '(szkic)'}
                      </p>
                      <Badge className={cn('text-xs border gap-0.5', cfg.className)}>
                        {cfg.icon} {cfg.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {inv.companyName ?? '—'} · {formatCents(inv.totalCents)}
                    </p>
                  </div>
                  {inv.ksefStatus === 'rejected' || inv.ksefStatus === 'failed' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Queue length indicator */}
      {data.queueLength > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <Clock className="w-3.5 h-3.5" />
          {data.queueLength} faktur w kolejce do ponownej wysyłki KSeF
        </div>
      )}
    </div>
  );
}
