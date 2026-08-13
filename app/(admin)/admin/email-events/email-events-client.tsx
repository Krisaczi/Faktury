'use client';

import { useState } from 'react';
import { Mail, MailOpen, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, Circle as XCircle, Inbox, RefreshCw, Paperclip, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { EmailEvent } from './actions';

interface Props {
  events:     EmailEvent[];
  totalCount: number;
}

const EVENT_CONFIG: Record<string, { label: string; icon: typeof Mail; color: string; badge: string }> = {
  received:  { label: 'Otrzymano',  icon: Mail,          color: 'text-blue-500',    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  processed: { label: 'Przetworzono', icon: CheckCircle2, color: 'text-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  rejected:  { label: 'Odrzucono',   icon: XCircle,       color: 'text-red-500',     badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  error:     { label: 'Błąd',        icon: AlertTriangle,  color: 'text-amber-500',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
    hour:  '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function EmailEventsClient({ events, totalCount }: Props) {
  const [selected, setSelected] = useState<EmailEvent | null>(null);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Activity className="w-4 h-4" />
          <span>{totalCount} łącznie zdarzeń</span>
          {events.length > 0 && (
            <span className="text-xs text-slate-400">
              · ostatnie: {formatDate(events[0].created_at)}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
          className="gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Odśwież
        </Button>
      </div>

      {/* Event list */}
      {events.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
            <Inbox className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Brak zdarzeń e-mail</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Wiadomości e-mail przychodzące na adresy ingestion pojawią się tutaj.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map((evt) => {
            const cfg = EVENT_CONFIG[evt.event_type] ?? EVENT_CONFIG.received;
            const Icon = cfg.icon;
            return (
              <Card
                key={evt.id}
                className={`p-4 cursor-pointer hover:shadow-md transition-all border-l-4 ${
                  evt.event_type === 'rejected' || evt.event_type === 'error'
                    ? 'border-l-red-500 bg-red-50/20 dark:bg-red-950/5'
                    : evt.event_type === 'processed'
                      ? 'border-l-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/5'
                      : 'border-l-blue-500 bg-blue-50/20 dark:bg-blue-950/5'
                }`}
                onClick={() => setSelected(evt)}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-1 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    evt.event_type === 'rejected' || evt.event_type === 'error'
                      ? 'bg-red-100 dark:bg-red-900/40'
                      : evt.event_type === 'processed'
                        ? 'bg-emerald-100 dark:bg-emerald-900/40'
                        : 'bg-blue-100 dark:bg-blue-900/40'
                  }`}>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={cfg.badge} variant="secondary">
                        {cfg.label}
                      </Badge>
                      {evt.provider && (
                        <span className="text-xs text-slate-400 capitalize">{evt.provider}</span>
                      )}
                      {evt.status_code && (
                        <span className="text-xs font-mono text-slate-400">HTTP {evt.status_code}</span>
                      )}
                      {evt.attachments_count > 0 && (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Paperclip className="w-3 h-3" />
                          {evt.attachments_count}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-0.5 truncate">
                      {evt.recipient ?? '(brak odbiorcy)'}
                    </p>
                    {evt.sender && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        od: {evt.sender}
                      </p>
                    )}
                    {evt.error_message && (
                      <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 truncate">
                        {evt.error_message}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                      <span>{formatDate(evt.created_at)}</span>
                      {evt.files_processed > 0 && (
                        <span className="text-emerald-500">
                          {evt.files_processed} plik(ów) przetworzono
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <div className="space-y-4">
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white">
                  {EVENT_CONFIG[selected.event_type]?.label ?? selected.event_type}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {formatDate(selected.created_at)}
                </DialogDescription>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold">Nadawca</p>
                  <p className="text-slate-900 dark:text-white font-medium">
                    {selected.sender ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold">Odbiorca</p>
                  <p className="text-slate-900 dark:text-white font-medium font-mono text-xs">
                    {selected.recipient ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold">Dostawca</p>
                  <p className="text-slate-900 dark:text-white font-medium capitalize">
                    {selected.provider ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold">Status HTTP</p>
                  <p className="text-slate-900 dark:text-white font-medium font-mono">
                    {selected.status_code ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold">Załączniki</p>
                  <p className="text-slate-900 dark:text-white font-medium">
                    {selected.attachments_count}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold">Pliki przetworzone</p>
                  <p className="text-slate-900 dark:text-white font-medium">
                    {selected.files_processed}
                  </p>
                </div>
                {selected.subject && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-400 uppercase font-semibold">Temat</p>
                    <p className="text-slate-900 dark:text-white font-medium">
                      {selected.subject}
                    </p>
                  </div>
                )}
                {selected.error_message && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-400 uppercase font-semibold">Błąd</p>
                    <div className="rounded-lg border border-red-200 dark:border-red-800 p-3 bg-red-50 dark:bg-red-900/10 text-sm text-red-700 dark:text-red-400">
                      {selected.error_message}
                    </div>
                  </div>
                )}
                {selected.upload_session_id && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-400 uppercase font-semibold">Sesja uploadu</p>
                    <p className="text-slate-900 dark:text-white font-mono text-xs">
                      {selected.upload_session_id}
                    </p>
                  </div>
                )}
                {selected.company_id && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-400 uppercase font-semibold">Firma</p>
                    <p className="text-slate-900 dark:text-white font-mono text-xs">
                      {selected.company_id}
                    </p>
                  </div>
                )}
              </div>

              {selected.raw_metadata && Object.keys(selected.raw_metadata).length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-2">Metadane</p>
                  <pre className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-600 dark:text-slate-400 overflow-x-auto">
                    {JSON.stringify(selected.raw_metadata, null, 2)}
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
