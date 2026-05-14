'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  TriangleAlert as AlertTriangle,
  Download,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  FileText,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Upload,
  RefreshCw,
  Info,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  useRiskReport,
  useRiskFilters,
  useExportCsv,
  type RiskReportFilters,
  type RiskReportRow,
  type RiskFlag,
} from '@/hooks/use-risk-reports';
import { SkeletonTable } from '@/components/ui/skeleton-loaders';
import { StateCard } from '@/components/ui/state-card';
import { PageHeader, Stack, Grid, HStack } from '@/components/ui/layout-primitives';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineLoader, ValidatingOverlay } from '@/components/ui/skeleton-loaders';

// ─── Risk badge ────────────────────────────────────────────────────────────────
function RiskBadge({ level }: { level: RiskReportRow['overall_risk'] }) {
  if (!level) {
    return (
      <Badge variant="outline" className="text-slate-400 border-slate-200 dark:border-slate-700">—</Badge>
    );
  }
  const styles: Record<string, string> = {
    high:     'bg-red-100    text-red-700    border-red-200    dark:bg-red-900/30    dark:text-red-400    dark:border-red-800',
    medium:   'bg-amber-100  text-amber-700  border-amber-200  dark:bg-amber-900/30  dark:text-amber-400  dark:border-amber-800',
    low:      'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    critical: 'bg-red-200    text-red-800    border-red-300    dark:bg-red-900/50    dark:text-red-300    dark:border-red-700',
  };
  return (
    <Badge variant="outline" className={cn('capitalize font-semibold text-xs', styles[level] ?? styles.low)}>
      {level}
    </Badge>
  );
}

// ─── Flags cell ────────────────────────────────────────────────────────────────
function FlagsCell({ count, flags }: { count: number; flags: RiskFlag[] }) {
  if (count === 0) return <span className="text-slate-400 text-sm">—</span>;
  const severityColor: Record<string, string> = {
    critical: 'text-red-600',
    high:     'text-red-500',
    medium:   'text-amber-500',
    low:      'text-emerald-500',
    info:     'text-blue-500',
  };
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-default">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{count}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs p-2 space-y-1.5">
          {flags.slice(0, 5).map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={cn('font-semibold capitalize shrink-0', severityColor[f.severity] ?? 'text-slate-500')}>
                {f.severity}
              </span>
              <span className="text-slate-600 dark:text-slate-300 leading-snug">{f.message}</span>
            </div>
          ))}
          {flags.length > 5 && (
            <p className="text-xs text-slate-400">+{flags.length - 5} more</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Sort header ───────────────────────────────────────────────────────────────
function SortHeader({
  label, field, current, dir, onSort,
}: {
  label: string; field: string; current: string; dir: 'asc' | 'desc';
  onSort: (field: string) => void;
}) {
  const active = current === field;
  return (
    <button
      className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
      onClick={() => onSort(field)}
    >
      {label}
      {active ? (
        dir === 'desc' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />
      ) : (
        <ChevronsUpDown className="w-3.5 h-3.5 opacity-30 group-hover:opacity-60" />
      )}
    </button>
  );
}

// ─── Mobile row ────────────────────────────────────────────────────────────────
function MobileRow({ row, currency }: { row: RiskReportRow; currency?: string }) {
  const [open, setOpen] = useState(false);
  const cur    = currency ?? row.currency ?? 'PLN';
  const amount = row.amount != null
    ? new Intl.NumberFormat('pl-PL', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(row.amount)
    : '—';

  return (
    <div className="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <button
        className="w-full flex items-center justify-between py-3.5 px-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0 mr-3">
          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
            {row.invoice_number ?? 'No number'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{row.vendor_name ?? '—'} · {row.issue_date ?? '—'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RiskBadge level={row.overall_risk} />
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 text-sm animate-fade-in">
          <div className="flex justify-between">
            <span className="text-slate-500">Amount</span>
            <span className="font-medium text-slate-900 dark:text-white tabular">{amount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Due date</span>
            <span className="text-slate-700 dark:text-slate-300">{row.due_date ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Flags</span>
            <FlagsCell count={row.flag_count} flags={row.flags} />
          </div>
          <Link
            href={`/invoice/${row.id}`}
            className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-xs mt-1"
          >
            <ExternalLink className="w-3 h-3" />
            View details
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function RiskReportPage() {
  const [filters, setFilters] = useState<RiskReportFilters>({
    page: 1, pageSize: 20, sortBy: 'issue_date', sortDir: 'desc',
  });

  const [searchInput, setSearchInput] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = useCallback((val: string) => {
    setSearchInput(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setFilters((f) => ({ ...f, search: val || undefined, page: 1 }));
    }, 350);
  }, []);

  const [fromInput,   setFromInput]   = useState('');
  const [toInput,     setToInput]     = useState('');
  const [vendorInput, setVendorInput] = useState('');
  const [riskInput,   setRiskInput]   = useState('');

  const applyFilters = useCallback(() => {
    setFilters((f) => ({
      ...f,
      from:      fromInput   || undefined,
      to:        toInput     || undefined,
      vendorId:  vendorInput || undefined,
      riskLevel: riskInput   || undefined,
      page:      1,
    }));
  }, [fromInput, toInput, vendorInput, riskInput]);

  const clearFilters = useCallback(() => {
    setFromInput(''); setToInput(''); setVendorInput(''); setRiskInput(''); setSearchInput('');
    setFilters({ page: 1, pageSize: filters.pageSize, sortBy: 'issue_date', sortDir: 'desc' });
  }, [filters.pageSize]);

  const { data, isLoading, isValidating, error, mutate } = useRiskReport(filters);
  const { data: filterOpts } = useRiskFilters();
  const { exportCsv, loading: exporting } = useExportCsv();

  const handleSort = useCallback((field: string) => {
    setFilters((f) => ({
      ...f,
      sortBy:  field as 'issue_date' | 'amount',
      sortDir: f.sortBy === field && f.sortDir === 'desc' ? 'asc' : 'desc',
      page:    1,
    }));
  }, []);

  const totalPages = data ? Math.ceil(data.totalCount / (filters.pageSize ?? 20)) : 0;
  const currency   = data?.rows?.[0]?.currency ?? 'PLN';

  function formatAmount(amount: number | null, cur?: string) {
    if (amount == null) return '—';
    return new Intl.NumberFormat('pl-PL', {
      style:    'currency',
      currency: cur ?? currency,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  const activeFilters = [
    filters.from      && `From: ${filters.from}`,
    filters.to        && `To: ${filters.to}`,
    filters.vendorId  && filterOpts?.vendors.find((v) => v.id === filters.vendorId)?.name,
    filters.riskLevel && `Risk: ${filters.riskLevel}`,
    filters.search    && `"${filters.search}"`,
  ].filter(Boolean) as string[];

  return (
    <TooltipProvider>
      <Stack gap="5" className="max-w-7xl">
        {/* Header */}
        <PageHeader
          title="Risk Report"
          description="Paginated invoice risk analysis scoped to your company."
        >
          <Button
            onClick={() => exportCsv({
              from: filters.from, to: filters.to,
              vendorId: filters.vendorId, riskLevel: filters.riskLevel, search: filters.search,
            })}
            disabled={exporting || isLoading}
            variant="outline"
            className="shrink-0 border-slate-200 dark:border-slate-700"
          >
            {exporting
              ? <><InlineLoader size="sm" className="mr-2 text-slate-500" />Exporting…</>
              : <><Download className="w-4 h-4 mr-2" />Export CSV</>}
          </Button>
        </PageHeader>

        {/* Error banner */}
        {error && !isLoading && (
          <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Failed to load report</p>
              <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 truncate">{error.message}</p>
            </div>
            <Button
              size="sm" variant="ghost"
              onClick={() => mutate()}
              className="text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 h-7 px-2 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />Retry
            </Button>
          </div>
        )}

        {/* KPI summary */}
        <Grid cols={{ base: 2, lg: 4 }} gap="3">
          {[
            {
              label:   'Total Invoices',
              value:   data?.totalCount ?? 0,
              color:   'text-slate-900 dark:text-white',
              bg:      'bg-slate-100 dark:bg-slate-800',
              loading: isLoading,
            },
            {
              label:   'High Risk',
              value:   data?.highRiskCount ?? 0,
              color:   (data?.highRiskCount ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
              bg:      (data?.highRiskCount ?? 0) > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20',
              loading: isLoading,
            },
            {
              label:   'Flagged Amount',
              value:   formatAmount(data?.totalFlaggedAmount ?? 0),
              color:   'text-amber-600 dark:text-amber-400',
              bg:      'bg-amber-50 dark:bg-amber-900/20',
              loading: isLoading,
            },
            {
              label:   'Page',
              value:   `${filters.page ?? 1} / ${totalPages || 1}`,
              color:   'text-slate-600 dark:text-slate-400',
              bg:      'bg-slate-100 dark:bg-slate-800',
              loading: false,
            },
          ].map(({ label, value, color, bg, loading }) => (
            <Card key={label} className="border-slate-200 dark:border-slate-800">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {label}
                </p>
                {loading ? (
                  <Skeleton className="h-7 w-16 mt-1.5" />
                ) : (
                  <p className={cn('text-xl font-bold mt-1.5 tabular', color)}>{value}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </Grid>

        {/* Filters */}
        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 shrink-0">From</span>
                <input
                  type="date"
                  value={fromInput}
                  onChange={(e) => setFromInput(e.target.value)}
                  className="text-sm border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 shrink-0">To</span>
                <input
                  type="date"
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                  className="text-sm border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
              </div>
              <Select value={vendorInput || 'all'} onValueChange={(v) => setVendorInput(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-44 h-8 text-sm border-slate-200 dark:border-slate-700">
                  <SelectValue placeholder="All vendors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vendors</SelectItem>
                  {(filterOpts?.vendors ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={riskInput || 'all'} onValueChange={(v) => setRiskInput(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-36 h-8 text-sm border-slate-200 dark:border-slate-700">
                  <SelectValue placeholder="All risk levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {['high', 'medium', 'low', 'critical'].map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={applyFilters} className="h-8 bg-blue-600 hover:bg-blue-700 text-white">
                Apply
              </Button>
              {activeFilters.length > 0 && (
                <Button size="sm" variant="ghost" onClick={clearFilters} className="h-8 text-slate-500">
                  <X className="w-3.5 h-3.5 mr-1" />Clear
                </Button>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search invoice number or vendor…"
                className="w-full pl-9 pr-9 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              />
              {searchInput && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                  onClick={() => handleSearch('')}
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {activeFilters.length > 0 && (
              <HStack gap="1" wrap className="mt-2">
                {activeFilters.map((f) => (
                  <Badge key={f} variant="outline" className="text-xs py-0.5 px-2 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700">
                    {f}
                  </Badge>
                ))}
              </HStack>
            )}
          </CardContent>
        </Card>

        {/* Table */}
        <ValidatingOverlay isValidating={isValidating && !isLoading}>
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white">
                  Invoices
                </CardTitle>
                <div className="flex items-center gap-2">
                  {isValidating && !isLoading && (
                    <InlineLoader size="xs" className="text-slate-400" />
                  )}
                  <CardDescription>
                    {isLoading ? 'Loading…' : `${data?.totalCount ?? 0} total`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <Separator />

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm" aria-label="Invoice risk report" aria-busy={isLoading}>
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    {[
                      { label: 'Invoice #',  field: null,         w: 'w-40' },
                      { label: 'Vendor',     field: null,         w: '' },
                      { label: 'Risk',       field: null,         w: 'w-24' },
                      { label: 'Issue Date', field: 'issue_date', w: 'w-28' },
                      { label: 'Amount',     field: 'amount',     w: 'w-28 text-right' },
                      { label: 'Flags',      field: null,         w: 'w-16 text-center' },
                      { label: 'Actions',    field: null,         w: 'w-20 text-center' },
                    ].map(({ label, field, w }) => (
                      <th key={label} className={cn('px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider', w)}>
                        {field ? (
                          <SortHeader
                            label={label} field={field}
                            current={filters.sortBy ?? 'issue_date'}
                            dir={filters.sortDir ?? 'desc'}
                            onSort={handleSort}
                          />
                        ) : label}
                      </th>
                    ))}
                  </tr>
                </thead>

                {isLoading ? (
                  <SkeletonTable rows={8} cols={7} />
                ) : error ? (
                  <tbody>
                    <tr>
                      <td colSpan={7} className="p-0">
                        <StateCard
                          variant="error"
                          title="Failed to load invoices"
                          description={error.message}
                          primaryAction={{ label: 'Retry', onClick: () => mutate(), icon: RefreshCw, variant: 'default' }}
                        />
                      </td>
                    </tr>
                  </tbody>
                ) : !data?.rows.length ? (
                  <tbody>
                    <tr>
                      <td colSpan={7} className="p-0">
                        <StateCard
                          variant="empty"
                          icon={FileText}
                          title="No invoices found"
                          description={activeFilters.length > 0
                            ? 'Try adjusting your filters to see results.'
                            : 'Upload invoices or fetch from KSeF to get started.'}
                          primaryAction={activeFilters.length === 0
                            ? { label: 'Upload invoices', href: '/upload', icon: Upload, variant: 'default' }
                            : { label: 'Clear filters', onClick: clearFilters, icon: X }}
                        />
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  <tbody className="animate-fade-in">
                    {data.rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300 max-w-[10rem] truncate">
                          {row.invoice_number ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300 max-w-0 truncate">
                          {row.vendor_id ? (
                            <Link href="/vendors" className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors">
                              {row.vendor_name ?? '—'}
                            </Link>
                          ) : (
                            <span className="text-slate-400">{row.vendor_name ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <RiskBadge level={row.overall_risk} />
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 tabular">
                          {row.issue_date ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-300 tabular">
                          {formatAmount(row.amount, row.currency)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <FlagsCell count={row.flag_count} flags={row.flags} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Link
                                  href={`/invoice/${row.id}`}
                                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center focus-ring"
                                >
                                  <Info className="w-3.5 h-3.5" />
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent>View details</TooltipContent>
                            </Tooltip>
                            {row.raw_file_url && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={row.raw_file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-ring"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent>Download file</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
            </div>

            {/* Mobile rows */}
            <div className="md:hidden" aria-label="Invoice list" aria-busy={isLoading}>
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="space-y-1.5 py-1" aria-hidden="true">
                      <div className="h-4 rounded bg-slate-100 dark:bg-slate-800 animate-pulse w-3/4" />
                      <div className="h-3 rounded bg-slate-100 dark:bg-slate-800 animate-pulse w-1/2" />
                    </div>
                  ))}
                </div>
              ) : !data?.rows.length ? (
                <StateCard
                  variant="empty"
                  icon={FileText}
                  title="No invoices found"
                  description={activeFilters.length > 0 ? 'Try adjusting your filters.' : 'Upload invoices to get started.'}
                  compact
                />
              ) : (
                <div className="animate-fade-in">
                  {data.rows.map((row) => (
                    <MobileRow key={row.id} row={row} currency={currency} />
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {(data?.totalCount ?? 0) > 0 && (
              <>
                <Separator />
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3">
                  <HStack gap="2" className="text-sm text-slate-500">
                    <span className="text-xs">Rows per page</span>
                    <Select
                      value={String(filters.pageSize ?? 20)}
                      onValueChange={(v) => setFilters((f) => ({ ...f, pageSize: Number(v), page: 1 }))}
                    >
                      <SelectTrigger className="w-16 h-7 text-xs border-slate-200 dark:border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[10, 20, 50, 100].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs tabular">
                      {((filters.page ?? 1) - 1) * (filters.pageSize ?? 20) + 1}–
                      {Math.min((filters.page ?? 1) * (filters.pageSize ?? 20), data?.totalCount ?? 0)}{' '}
                      of {data?.totalCount ?? 0}
                    </span>
                  </HStack>

                  <HStack gap="1">
                    <Button
                      variant="outline" size="sm"
                      className="h-7 w-7 p-0 border-slate-200 dark:border-slate-700"
                      disabled={(filters.page ?? 1) <= 1}
                      onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                      const pg = i + 1;
                      return (
                        <Button
                          key={pg}
                          variant={filters.page === pg ? 'default' : 'outline'}
                          size="sm"
                          className={cn(
                            'h-7 w-7 p-0 text-xs',
                            filters.page === pg
                              ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
                              : 'border-slate-200 dark:border-slate-700'
                          )}
                          onClick={() => setFilters((f) => ({ ...f, page: pg }))}
                          aria-label={`Page ${pg}`}
                          aria-current={filters.page === pg ? 'page' : undefined}
                        >
                          {pg}
                        </Button>
                      );
                    })}
                    {totalPages > 5 && (
                      <>
                        <span className="text-slate-400 text-xs px-1">…</span>
                        <Button
                          variant={filters.page === totalPages ? 'default' : 'outline'}
                          size="sm"
                          className={cn(
                            'h-7 w-7 p-0 text-xs',
                            filters.page === totalPages
                              ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
                              : 'border-slate-200 dark:border-slate-700'
                          )}
                          onClick={() => setFilters((f) => ({ ...f, page: totalPages }))}
                        >
                          {totalPages}
                        </Button>
                      </>
                    )}
                    <Button
                      variant="outline" size="sm"
                      className="h-7 w-7 p-0 border-slate-200 dark:border-slate-700"
                      disabled={(filters.page ?? 1) >= totalPages}
                      onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                      aria-label="Next page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </HStack>
                </div>
              </>
            )}
          </Card>
        </ValidatingOverlay>
      </Stack>
    </TooltipProvider>
  );
}
