'use client';

import { useCallback, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  X,
  Filter,
  Calendar,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AdminInvoiceListItem } from '@/app/(admin)/admin/invoices/page';
import type { IssuedInvoiceStatus, KsefStatus } from '@/types/issued-invoice';
import { STATUS_LABELS, KSEF_STATUS_LABELS } from '@/types/issued-invoice';

const PAGE_SIZE = 25;

const STATUS_BADGE: Record<IssuedInvoiceStatus, string> = {
  draft:        'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  issued:       'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  sent_to_ksef: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  accepted:     'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  rejected:     'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  cancelled:    'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700',
};

const KSEF_BADGE: Record<KsefStatus, string> = {
  pending:    'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  processing: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  accepted:   'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  rejected:   'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
};

function StatusBadge({ status }: { status: IssuedInvoiceStatus }) {
  return (
    <Badge variant="outline" className={cn('text-xs font-medium capitalize', STATUS_BADGE[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function KsefBadge({ status }: { status: KsefStatus | null }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>;
  return (
    <Badge variant="outline" className={cn('text-xs font-medium', KSEF_BADGE[status])}>
      {KSEF_STATUS_LABELS[status]}
    </Badge>
  );
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd.MM.yyyy'); } catch { return d; }
}

function fmtCurrency(n: number, currency = 'PLN') {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(n);
}

interface Props {
  rows: AdminInvoiceListItem[];
  totalCount: number;
  searchParams: {
    q?: string;
    status?: string;
    ksef_status?: string;
    from?: string;
    to?: string;
    page?: string;
  };
}

export function AdminInvoiceTable({ rows, totalCount, searchParams }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const currentPage = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const totalPages  = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasFilters  = !!(searchParams.q || searchParams.status || searchParams.ksef_status || searchParams.from || searchParams.to);

  const push = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams();
      const merged = { ...searchParams, ...updates };
      Object.entries(merged).forEach(([k, v]) => {
        if (v && v !== 'all') params.set(k, v);
      });
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    },
    [pathname, router, searchParams]
  );

  function clearFilters() {
    startTransition(() => router.push(pathname));
  }

  const activeFilterCount = [
    searchParams.status,
    searchParams.ksef_status,
    searchParams.from || searchParams.to,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Search + filter row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Szukaj po numerze, nabywcy lub NIP…"
            defaultValue={searchParams.q ?? ''}
            onChange={(e) => push({ q: e.target.value || undefined, page: '1' })}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1.5 text-slate-500">
              <X className="w-3.5 h-3.5" />
              Wyczyść
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <Filter className="w-3.5 h-3.5" />
          Filtry
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </div>

        {/* Status filter */}
        <Select
          value={searchParams.status ?? 'all'}
          onValueChange={(v) => push({ status: v, page: '1' })}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Status faktury" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie statusy</SelectItem>
            <SelectItem value="draft">Szkic</SelectItem>
            <SelectItem value="issued">Wystawiona</SelectItem>
            <SelectItem value="sent_to_ksef">Wysłana do KSeF</SelectItem>
            <SelectItem value="accepted">Zaakceptowana</SelectItem>
            <SelectItem value="rejected">Odrzucona</SelectItem>
            <SelectItem value="cancelled">Anulowana</SelectItem>
          </SelectContent>
        </Select>

        {/* KSeF status filter */}
        <Select
          value={searchParams.ksef_status ?? 'all'}
          onValueChange={(v) => push({ ksef_status: v, page: '1' })}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Status KSeF" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie (KSeF)</SelectItem>
            <SelectItem value="pending">Oczekuje</SelectItem>
            <SelectItem value="processing">Przetwarzanie</SelectItem>
            <SelectItem value="accepted">Zaakceptowana</SelectItem>
            <SelectItem value="rejected">Odrzucona</SelectItem>
          </SelectContent>
        </Select>

        {/* Date from */}
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <Input
            type="date"
            defaultValue={searchParams.from ?? ''}
            onChange={(e) => push({ from: e.target.value || undefined, page: '1' })}
            className="h-8 w-36 text-xs"
            placeholder="Od"
          />
          <span className="text-xs text-slate-400">–</span>
          <Input
            type="date"
            defaultValue={searchParams.to ?? ''}
            onChange={(e) => push({ to: e.target.value || undefined, page: '1' })}
            className="h-8 w-36 text-xs"
            placeholder="Do"
          />
        </div>
      </div>

      {/* Row count */}
      <p className="text-xs text-slate-500">
        {totalCount === 0
          ? 'Brak wyników'
          : `${totalCount.toLocaleString('pl-PL')} faktur${totalCount !== 1 ? '' : 'a'}`}
      </p>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
            <FileText className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Brak faktur</p>
          <p className="text-xs text-slate-400 mt-1">
            {hasFilters ? 'Spróbuj zmienić filtry lub wyczyścić wyszukiwanie.' : 'Nie wystawiono jeszcze żadnych faktur.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
          {/* Column headers */}
          <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)] gap-4 px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
            <span>Numer faktury</span>
            <span>Nabywca</span>
            <span>Data wystawienia</span>
            <span className="text-right">Kwota brutto</span>
            <span>Status</span>
            <span>KSeF</span>
          </div>

          <div role="list" aria-label="Lista faktur wystawionych">
            {rows.map((inv, i) => (
              <Link
                key={inv.id}
                href={`/admin/invoices/${inv.id}`}
                role="listitem"
                className={cn(
                  'grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)] gap-4 items-center px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group',
                  i < rows.length - 1 && 'border-b border-slate-100 dark:border-slate-800'
                )}
              >
                {/* Invoice number */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate transition-colors">
                      {inv.invoice_number}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      wystawiona {fmtDate(inv.created_at)}
                    </p>
                  </div>
                </div>

                {/* Buyer */}
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{inv.buyer_name}</p>
                  {inv.buyer_nip && (
                    <p className="text-xs text-slate-400 font-mono">NIP {inv.buyer_nip}</p>
                  )}
                </div>

                {/* Issue date */}
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
                    {fmtDate(inv.issue_date)}
                  </span>
                </div>

                {/* Gross total */}
                <div className="text-right md:text-left">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                    {fmtCurrency(inv.gross_total, inv.currency)}
                  </span>
                </div>

                {/* Status */}
                <div>
                  <StatusBadge status={inv.status as IssuedInvoiceStatus} />
                </div>

                {/* KSeF status */}
                <div>
                  <KsefBadge status={inv.ksef_status as KsefStatus | null} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-slate-500">
            Strona {currentPage} z {totalPages} &middot; {totalCount.toLocaleString('pl-PL')} łącznie
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={currentPage <= 1}
              onClick={() => push({ page: String(currentPage - 1) })}
              aria-label="Poprzednia strona"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={currentPage >= totalPages}
              onClick={() => push({ page: String(currentPage + 1) })}
              aria-label="Następna strona"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}