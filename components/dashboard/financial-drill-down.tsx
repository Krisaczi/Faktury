'use client';

import useSWR from 'swr';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { financialSummaryService, DRILL_DOWN_LIMIT } from '@/lib/financial/financial-summary-service';
import type { DateRange } from '@/lib/financial/date-range';
import { isValidDateRange } from '@/lib/financial/date-range';
import { cn } from '@/lib/utils';

export type DrillDownKind = 'revenue' | 'expenses';

interface Props {
  kind: DrillDownKind | null;
  range: DateRange;
  currency: string;
  onClose: () => void;
}

const COPY: Record<DrillDownKind, { title: string; counterparty: string }> = {
  revenue: { title: 'Revenue: issued invoices', counterparty: 'Buyer' },
  expenses: { title: 'Expenses: received invoices', counterparty: 'Seller' },
};

export function FinancialDrillDown({ kind, range, currency, onClose }: Props) {
  const { data, error, isLoading } = useSWR(
    kind && isValidDateRange(range) ? ['financial-drill-down', kind, range.from, range.to] : null,
    () =>
      kind === 'revenue'
        ? financialSummaryService.getRevenueInvoices(range)
        : financialSummaryService.getExpenseInvoices(range)
  );

  const copy = COPY[kind ?? 'revenue'];
  const total = (data ?? []).reduce((sum, r) => sum + r.amount, 0);
  const fmt = (n: number) =>
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);

  return (
    <Dialog open={kind !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {range.from} to {range.to}
            {data && data.length >= DRILL_DOWN_LIMIT ? ` (showing the latest ${DRILL_DOWN_LIMIT})` : ''}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="py-6 text-sm text-slate-500">Loading invoices...</p>}
        {error && <p role="alert" className="py-6 text-sm text-red-600">These invoices could not be loaded.</p>}
        {data && data.length === 0 && (
          <p className="py-6 text-sm text-slate-500 dark:text-slate-400">No data available for selected period.</p>
        )}
        {data && data.length > 0 && (
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Number</th>
                  <th className="px-3 py-2 font-medium">{copy.counterparty}</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{row.number || '-'}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.counterparty || '-'}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">{row.date}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', kind === 'revenue' ? 'text-emerald-600' : 'text-red-600')}>
                      {fmt(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 dark:border-slate-700 font-semibold">
                  <td className="px-3 py-2" colSpan={3}>Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
