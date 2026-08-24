'use client';

import { useState, useTransition } from 'react';
import { Receipt, Loader as Loader2, Search, Ban, CircleCheck as CheckCircle, Send, FileText, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PlatformInvoice {
  id:                string;
  invoiceNumber:     string | null;
  entityId:          string;
  status:            string;
  periodStart:       string;
  periodEnd:         string;
  subtotalCents:     number;
  taxCents:          number;
  totalCents:        number;
  currency:          string;
  issuedAt:          string | null;
  dueDate:           string | null;
  sentAt:            string | null;
  notes:             string | null;
  internalReference: string | null;
  createdAt:         string;
  companyName:       string | null;
  companyEmail:      string | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  draft:   { label: 'Szkic',     className: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400', icon: <FileText className="w-3 h-3" /> },
  issued:  { label: 'Wystawiona', className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400', icon: <CheckCircle className="w-3 h-3" /> },
  sent:    { label: 'Wysłana',   className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400', icon: <Send className="w-3 h-3" /> },
  paid:    { label: 'Opłacona',  className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400', icon: <CheckCircle className="w-3 h-3" /> },
  revoked: { label: 'Cofnięta',  className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400', icon: <Ban className="w-3 h-3" /> },
};

function formatCents(c: number): string {
  return `${(c / 100).toFixed(2)} zł`;
}

export function PlatformInvoicesClient({ initialInvoices, initialTotal, isOwner }: {
  initialInvoices: PlatformInvoice[];
  initialTotal: number;
  isOwner: boolean;
}) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [total, setTotal]       = useState(initialTotal);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isPending, start]      = useTransition();
  const [error, setError]       = useState<string | null>(null);

  function loadInvoices() {
    setError(null);
    start(async () => {
      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.set('status', statusFilter);
        params.set('limit', '200');
        const res = await fetch(`/api/owner/invoices?${params.toString()}`);
        if (!res.ok) { setError('Błąd ładowania faktur.'); return; }
        const data = await res.json() as { invoices: PlatformInvoice[]; total: number };
        setInvoices(data.invoices);
        setTotal(data.total);
      } catch {
        setError('Błąd połączenia.');
      }
    });
  }

  async function revokeInvoice(id: string) {
    const reason = prompt('Powód cofnięcia faktury:');
    if (reason === null) return;
    start(async () => {
      const res = await fetch(`/api/owner/invoices/${id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      if (!res.ok) { setError('Błąd cofania faktury.'); return; }
      loadInvoices();
    });
  }

  async function sendInvoice(id: string) {
    start(async () => {
      const res = await fetch(`/api/owner/invoices/${id}/send`, { method: 'POST' });
      if (!res.ok) { setError('Błąd wysyłania faktury.'); return; }
      loadInvoices();
    });
  }

  const filtered = invoices.filter((inv) =>
    !search ||
    (inv.companyName?.toLowerCase().includes(search.toLowerCase())) ||
    (inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase())) ||
    (inv.companyEmail?.toLowerCase().includes(search.toLowerCase())),
  );

  const totalRevenueCents = invoices.filter((i) => i.status === 'issued' || i.status === 'sent' || i.status === 'paid').reduce((sum, i) => sum + i.totalCents, 0);
  const totalRevokedCents = invoices.filter((i) => i.status === 'revoked').reduce((sum, i) => sum + i.totalCents, 0);
  const draftCount = invoices.filter((i) => i.status === 'draft').length;
  const issuedCount = invoices.filter((i) => i.status === 'issued' || i.status === 'sent' || i.status === 'paid').length;

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-400">Brak uprawnień. Tylko właściciel platformy ma dostęp.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="w-4 h-4 text-blue-500" />
            <p className="text-xs text-slate-400">Wszystkie</p>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">{total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <p className="text-xs text-slate-400">Wystawione</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{issuedCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-slate-400" />
            <p className="text-xs text-slate-400">Szkice</p>
          </div>
          <p className="text-2xl font-bold text-slate-600 dark:text-slate-400">{draftCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-blue-500" />
            <p className="text-xs text-slate-400">Przychód (brutto)</p>
          </div>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{formatCents(totalRevenueCents)}</p>
        </div>
      </div>

      {totalRevokedCents > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
          <Ban className="w-3.5 h-3.5" />
          Cofnięte faktury: {formatCents(totalRevokedCents)}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj po firmie, numerze, e-mailu..."
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); }}>
          <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie statusy</SelectItem>
            <SelectItem value="draft">Szkice</SelectItem>
            <SelectItem value="issued">Wystawione</SelectItem>
            <SelectItem value="sent">Wysłane</SelectItem>
            <SelectItem value="paid">Opłacone</SelectItem>
            <SelectItem value="revoked">Cofnięte</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={loadInvoices} disabled={isPending} className="gap-2">
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />}
          Odśwież
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Invoices table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <Receipt className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Faktury platformowe ({filtered.length})
          </h2>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">Brak faktur</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((inv) => {
              const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.draft;
              return (
                <div key={inv.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {inv.invoiceNumber ?? '(szkic)'}
                      </p>
                      <Badge className={cn('text-xs border gap-1', cfg.className)}>
                        {cfg.icon} {cfg.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {inv.companyName ?? '—'} · {inv.periodStart} → {inv.periodEnd}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-shrink-0">
                    {formatCents(inv.totalCents)}
                  </p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {inv.status === 'issued' && (
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => sendInvoice(inv.id)}
                        disabled={isPending}
                        className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        title="Wyślij"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    )}
                    {(inv.status === 'issued' || inv.status === 'sent') && (
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => revokeInvoice(inv.id)}
                        disabled={isPending}
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Cofnij"
                      >
                        <Ban className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
