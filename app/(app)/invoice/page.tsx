'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  TriangleAlert as AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Building2,
  Filter,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  useRiskReport,
  useRiskFilters,
  type RiskReportFilters,
} from '@/hooks/use-risk-reports';
import { StateCard } from '@/components/ui/state-card';
import { SkeletonList } from '@/components/ui/skeleton-loaders';
import { PageHeader, Stack } from '@/components/ui/layout-primitives';

function fmt(date: string | null) {
  if (!date) return '—';
  try { return format(parseISO(date), 'MMM d, yyyy'); } catch { return date; }
}

function fmtCurrency(amount: number | null, currency = 'PLN') {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(amount);
}

const riskStyles: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  high:     'bg-red-50  text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  medium:   'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  low:      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
};

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return (
    <Badge variant="outline" className="text-slate-400 border-slate-200 dark:border-slate-700 text-xs">—</Badge>
  );
  return (
    <Badge variant="outline" className={cn('capitalize text-xs font-medium', riskStyles[level] ?? '')}>
      {level}
    </Badge>
  );
}

type SortField = 'issue_date' | 'amount';
type SortDir   = 'asc' | 'desc';

export default function InvoicesPage() {
  const [search,      setSearch]      = useState('');
  const [vendorId,    setVendorId]    = useState('');
  const [riskLevel,   setRisk]        = useState('');
  const [page,        setPage]        = useState(1);
  const [sortBy,      setSortBy]      = useState<SortField>('issue_date');
  const [sortDir,     setSortDir]     = useState<SortDir>('desc');
  const [showFilters, setShowFilters] = useState(false);

  const filters: RiskReportFilters = {
    search:    search    || undefined,
    vendorId:  vendorId  || undefined,
    riskLevel: riskLevel || undefined,
    page,
    pageSize: 20,
    sortBy,
    sortDir,
  };

  const { data, isLoading, error, mutate } = useRiskReport(filters);
  const { data: filterOpts } = useRiskFilters();

  const rows       = data?.rows       ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 20));
  const hasFilters = !!(search || vendorId || riskLevel);

  function toggleSort(field: SortField) {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortDir('desc'); }
    setPage(1);
  }

  function clearFilters() {
    setSearch(''); setVendorId(''); setRisk(''); setPage(1);
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortBy !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />;
    return sortDir === 'asc'
      ? <ArrowUp   className="w-3.5 h-3.5 text-blue-500" />
      : <ArrowDown className="w-3.5 h-3.5 text-blue-500" />;
  }

  return (
    <Stack gap="6" className="max-w-6xl">
      <PageHeader
        title="Invoices"
        description="Browse, search, and review all imported invoices."
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'gap-2',
              showFilters && 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
            )}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasFilters && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                {[search, vendorId, riskLevel].filter(Boolean).length}
              </span>
            )}
          </Button>
          {totalCount > 0 && (
            <span className="text-sm text-slate-500 tabular-nums">
              {totalCount.toLocaleString()} invoice{totalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </PageHeader>

      {/* Search */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Search by invoice number or vendor…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            <div className="flex-1 min-w-[160px]">
              <Select
                value={vendorId || 'all'}
                onValueChange={(v) => { setVendorId(v === 'all' ? '' : v); setPage(1); }}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="All vendors" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vendors</SelectItem>
                  {(filterOpts?.vendors ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <Select
                value={riskLevel || 'all'}
                onValueChange={(v) => { setRisk(v === 'all' ? '' : v); setPage(1); }}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="All risk levels" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All risk levels</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button
                variant="ghost" size="sm"
                className="h-9 gap-1.5 text-slate-500"
                onClick={clearFilters}
              >
                <X className="w-3.5 h-3.5" />Clear
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && !isLoading && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300 flex-1">Failed to load invoices.</p>
          <Button
            size="sm" variant="ghost"
            onClick={() => mutate()}
            className="text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 h-7 px-2"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Retry
          </Button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <SkeletonList rows={8} hasIcon />
      ) : error ? (
        <StateCard
          variant="error"
          title="Could not load invoices"
          description="There was a problem fetching your invoice list."
          primaryAction={{ label: 'Retry', onClick: () => mutate(), icon: RefreshCw, variant: 'default' }}
        />
      ) : rows.length === 0 ? (
        <StateCard
          variant="empty"
          icon={FileText}
          title={hasFilters ? 'No matching invoices' : 'No invoices yet'}
          description={
            hasFilters
              ? 'Try adjusting your filters or search term.'
              : 'Upload your first invoice to get started.'
          }
          primaryAction={
            hasFilters
              ? { label: 'Clear filters', onClick: clearFilters, variant: 'outline' }
              : { label: 'Upload invoices', onClick: () => { window.location.href = '/upload'; }, icon: FileText, variant: 'default' }
          }
        />
      ) : (
        <>
          {/* Column headers */}
          <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_72px] gap-4 px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
            <span>Invoice</span>
            <span>Vendor</span>
            <button
              className="flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-200 transition-colors text-left"
              onClick={() => toggleSort('issue_date')}
            >
              Date <SortIcon field="issue_date" />
            </button>
            <button
              className="flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-200 transition-colors text-left"
              onClick={() => toggleSort('amount')}
            >
              Amount <SortIcon field="amount" />
            </button>
            <span>Risk</span>
            <span>Flags</span>
          </div>

          <div className="space-y-1.5" role="list" aria-label="Invoice list">
            {rows.map((invoice) => (
              <Link
                key={invoice.id}
                href={`/invoice/${invoice.id}`}
                role="listitem"
                className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_72px] gap-4 items-center px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all duration-150 group"
              >
                {/* Invoice */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate transition-colors">
                      {invoice.invoice_number ?? <span className="italic text-slate-400">No number</span>}
                    </p>
                    {invoice.seller_nip && (
                      <p className="text-xs text-slate-400 font-mono truncate">NIP {invoice.seller_nip}</p>
                    )}
                  </div>
                </div>

                {/* Vendor */}
                <div className="flex items-center gap-1.5 min-w-0 md:block">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 md:hidden" />
                  {invoice.vendor_name ? (
                    <span className="text-sm text-slate-600 dark:text-slate-400 truncate block">{invoice.vendor_name}</span>
                  ) : (
                    <span className="text-sm text-slate-400 italic">—</span>
                  )}
                </div>

                {/* Date */}
                <div className="flex items-center gap-1.5 md:block">
                  <span className="text-xs text-slate-400 md:hidden">Date:</span>
                  <span className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">{fmt(invoice.issue_date)}</span>
                </div>

                {/* Amount */}
                <div className="flex items-center gap-1.5 md:block">
                  <span className="text-xs text-slate-400 md:hidden">Amount:</span>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                    {fmtCurrency(invoice.amount, invoice.currency)}
                  </span>
                </div>

                {/* Risk */}
                <div className="flex items-center gap-1.5 md:block">
                  <span className="text-xs text-slate-400 md:hidden">Risk:</span>
                  <RiskBadge level={invoice.overall_risk} />
                </div>

                {/* Flags */}
                <div className="flex items-center gap-1.5 md:block">
                  <span className="text-xs text-slate-400 md:hidden">Flags:</span>
                  {invoice.flag_count > 0 ? (
                    <span className={cn(
                      'inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full text-xs font-bold tabular-nums',
                      invoice.overall_risk === 'critical' || invoice.overall_risk === 'high'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                    )}>
                      {invoice.flag_count}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-slate-500">
                Page {page} of {totalPages} &middot; {totalCount.toLocaleString()} total
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  className="h-8 w-8 p-0"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="h-8 w-8 p-0"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Stack>
  );
}
