'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, RefreshCw, CircleCheck as CheckCircle2, Circle as XCircle } from 'lucide-react';
import { useInvoices } from '@/hooks/use-invoices';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useAuth } from '@/providers/auth-provider';
import { syncInvoices } from '@/lib/actions/sync-invoices';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { InvoiceFiltersBar, type InvoiceFilters } from './invoice-filters';
import { mutate as globalMutate } from 'swr';
import { useT } from '@/providers/i18n-provider';

type SyncState = 'idle' | 'loading' | 'success' | 'error';

const formatCurrency = (amount: number, currency: string) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: currency || 'PLN' }).format(amount);

const formatDate = (date: string | null) =>
  date ? new Date(date).toLocaleDateString('pl-PL') : '—';

export function InvoiceTable() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: invoices, isLoading, error, mutate } = useInvoices();
  const { data: dashStats } = useDashboardStats();
  const t = useT();

  const riskConfig: Record<string, { label: string; className: string }> = {
    high: { label: t.invoices.riskLabels.high, className: 'bg-rose-100 text-rose-700 border-rose-200' },
    medium: { label: t.invoices.riskLabels.medium, className: 'bg-amber-100 text-amber-700 border-amber-200' },
    low: { label: t.invoices.riskLabels.low, className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    none: { label: t.invoices.riskLabels.none, className: 'bg-slate-100 text-slate-500 border-slate-200' },
  };

  function getRiskConfig(risk: string) {
    return riskConfig[risk?.toLowerCase()] ?? riskConfig['none'];
  }

  const [filters, setFilters] = useState<InvoiceFilters>({
    search: '',
    vendor: 'all',
    risk: 'all',
    dateFrom: '',
    dateTo: '',
  });

  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncMessage, setSyncMessage] = useState('');

  const vendors = useMemo(() => {
    const names = (invoices ?? [])
      .map((inv) => inv.company_vendors?.name ?? inv.seller_name)
      .filter(Boolean);
    return Array.from(new Set(names)).sort();
  }, [invoices]);

  const filtered = useMemo(() => {
    return (invoices ?? []).filter((inv) => {
      const vendorName = inv.company_vendors?.name ?? inv.seller_name ?? '';
      const searchLower = filters.search.toLowerCase();

      if (
        filters.search &&
        !inv.invoice_number.toLowerCase().includes(searchLower) &&
        !vendorName.toLowerCase().includes(searchLower) &&
        !inv.ksef_reference.toLowerCase().includes(searchLower)
      ) {
        return false;
      }

      if (filters.vendor && filters.vendor !== 'all' && vendorName !== filters.vendor) {
        return false;
      }

      if (filters.risk && filters.risk !== 'all' && inv.overall_risk !== filters.risk) {
        return false;
      }

      if (filters.dateFrom && inv.issue_date && inv.issue_date < filters.dateFrom) {
        return false;
      }

      if (filters.dateTo && inv.issue_date && inv.issue_date > filters.dateTo) {
        return false;
      }

      return true;
    });
  }, [invoices, filters]);

  const handleSync = async () => {
    const companyId = dashStats?.companyId;
    if (!companyId) {
      setSyncMessage(t.invoices.noCompany);
      setSyncState('error');
      setTimeout(() => setSyncState('idle'), 3500);
      return;
    }

    setSyncState('loading');
    setSyncMessage('');

    try {
      const summary = await syncInvoices(companyId);
      setSyncMessage(
        t.invoices.syncResult(summary.newInvoices, summary.updatedInvoices, summary.errors.length)
      );
      setSyncState('success');
      await mutate();
      if (user?.id) {
        await globalMutate(`dashboard-stats-${user.id}`);
      }
      setTimeout(() => setSyncState('idle'), 5000);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : t.invoices.syncFailed);
      setSyncState('error');
      setTimeout(() => setSyncState('idle'), 5000);
    }
  };

  const colCount = 6;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <InvoiceFiltersBar
          filters={filters}
          vendors={vendors}
          onChange={setFilters}
        />

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Button
            onClick={handleSync}
            disabled={syncState === 'loading'}
            size="sm"
            className={cn(
              'gap-2 font-semibold transition-all duration-200',
              syncState === 'success' && 'bg-emerald-600 hover:bg-emerald-700',
              syncState === 'error' && 'bg-rose-600 hover:bg-rose-700'
            )}
          >
            {syncState === 'loading' && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            {syncState === 'success' && <CheckCircle2 className="h-3.5 w-3.5" />}
            {syncState === 'error' && <XCircle className="h-3.5 w-3.5" />}
            {syncState === 'idle' && <RefreshCw className="h-3.5 w-3.5" />}
            {syncState === 'loading'
              ? t.invoices.syncing
              : syncState === 'success'
              ? t.invoices.synced
              : syncState === 'error'
              ? t.invoices.failed
              : t.invoices.syncFromKsef}
          </Button>
          {syncMessage && syncState !== 'loading' && (
            <p
              className={cn(
                'text-xs',
                syncState === 'success' && 'text-emerald-600',
                syncState === 'error' && 'text-rose-600'
              )}
            >
              {syncMessage}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-[110px]">{t.invoices.tableRisk}</TableHead>
              <TableHead>{t.invoices.tableInvoiceNo}</TableHead>
              <TableHead>{t.invoices.tableVendor}</TableHead>
              <TableHead className="text-right">{t.invoices.tableAmount}</TableHead>
              <TableHead>{t.invoices.tableIssueDate}</TableHead>
              <TableHead className="max-w-[200px]">{t.invoices.tableKsefRef}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 7 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: colCount }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={colCount} className="py-16 text-center text-muted-foreground">
                  {t.invoices.failedToLoad}
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-9 w-9 text-muted-foreground/30" />
                    <p className="text-sm font-medium text-muted-foreground">
                      {filters.search ||
                      (filters.vendor && filters.vendor !== 'all') ||
                      (filters.risk && filters.risk !== 'all') ||
                      filters.dateFrom ||
                      filters.dateTo
                        ? t.invoices.noInvoicesFilter
                        : t.invoices.noInvoicesYet}
                    </p>
                    {!filters.search &&
                      (!filters.vendor || filters.vendor === 'all') &&
                      (!filters.risk || filters.risk === 'all') &&
                      !filters.dateFrom &&
                      !filters.dateTo && (
                        <p className="text-xs text-muted-foreground">
                          {t.invoices.noInvoicesHint}
                        </p>
                      )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((invoice) => {
                const risk = getRiskConfig(invoice.overall_risk);
                const vendorName =
                  invoice.company_vendors?.name || invoice.seller_name || '—';

                return (
                  <TableRow
                    key={invoice.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/invoices/${invoice.id}`)}
                  >
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('text-xs font-medium', risk.className)}
                      >
                        {risk.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {invoice.invoice_number || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                      {vendorName}
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm tabular-nums">
                      {formatCurrency(invoice.amount, invoice.currency)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(invoice.issue_date)}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <span
                        className="block truncate font-mono text-xs text-muted-foreground"
                        title={invoice.ksef_reference}
                      >
                        {invoice.ksef_reference || '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading && (invoices?.length ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          {t.invoices.showing(filtered.length, invoices?.length ?? 0)}
        </p>
      )}
    </div>
  );
}
