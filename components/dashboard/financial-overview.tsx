'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, TrendingUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useFinancialSummary } from '@/hooks/use-financial-summary';
import {
  resolvePeriodRange,
  type DateRange,
  type FinancialPeriod,
} from '@/lib/financial/date-range';
import { FinancialDrillDown, type DrillDownKind } from './financial-drill-down';

const PERIODS: { value: FinancialPeriod; label: string }[] = [
  { value: 'week', label: 'Tydzień' },
  { value: 'month', label: 'Miesiąc' },
  { value: 'quarter', label: 'Kwartał' },
  { value: 'year', label: 'Rok' },
  { value: 'ytd', label: 'Bieżący rok' },
  { value: 'custom', label: 'Wybierz zakres' },
];

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

interface Props {
  currency: string;
}

export function FinancialOverview({ currency }: Props) {
  const [period, setPeriod] = useState<FinancialPeriod>('month');
  const [customRange, setCustomRange] = useState<DateRange>(() =>
    resolvePeriodRange('month', new Date())
  );
  const [drillDown, setDrillDown] = useState<DrillDownKind | null>(null);

  const range = useMemo<DateRange | null>(
    () => (period === 'custom' ? customRange : resolvePeriodRange(period, new Date())),
    [period, customRange]
  );

  const { summary, trend } = useFinancialSummary(range);
  const data = summary.data;
  const loading = summary.isLoading;
  const isEmpty = !!data && data.revenueCount === 0 && data.expenseCount === 0;
  const profit = data?.profit ?? 0;

  const chartData = (trend.data ?? []).map((p) => ({
    label: format(parseISO(p.bucket), trend.data && trend.data.length > 40 ? 'MMM yy' : 'MMM d'),
    Revenue: p.revenue,
    Expenses: p.expenses,
  }));

  return (
    <section aria-labelledby="financial-overview-title" className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 id="financial-overview-title" className="text-lg font-semibold text-slate-900 dark:text-white">
            Przegląd Twoich finansów
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Przychody, wydatki i szacowany zysk</p>
        </div>
        <div role="group" aria-label="Time period" className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <Button
              key={p.value}
              size="sm"
              variant={period === p.value ? 'default' : 'outline'}
              aria-pressed={period === p.value}
              onClick={() => setPeriod(p.value)}
              className="transition-colors duration-150"
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Data od
            <Input
              type="date"
              value={customRange.from}
              max={customRange.to}
              onChange={(e) => setCustomRange((r) => ({ ...r, from: e.target.value }))}
              className="w-44"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Data do
            <Input
              type="date"
              value={customRange.to}
              min={customRange.from}
              onChange={(e) => setCustomRange((r) => ({ ...r, to: e.target.value }))}
              className="w-44"
            />
          </label>
          {range && range.from > range.to && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Data rozpoczęcia musi przypadać przed datą zakończenia.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard
          title="Revenue"
          value={formatAmount(data?.revenue ?? 0, currency)}
          tone="positive"
          icon={ArrowUpRight}
          loading={loading}
          onClick={() => setDrillDown('revenue')}
          hint="Issued invoices in period"
        />
        <SummaryCard
          title="Expenses"
          value={formatAmount(data?.expenses ?? 0, currency)}
          tone="negative"
          icon={ArrowDownRight}
          loading={loading}
          onClick={() => setDrillDown('expenses')}
          hint="Received invoices in period"
        />
        <SummaryCard
          title="Estimated Profit"
          value={formatAmount(profit, currency)}
          tone={profit >= 0 ? 'positive' : 'negative'}
          icon={TrendingUp}
          loading={loading}
          hint="Revenue minus expenses"
        />
      </div>

      {summary.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Nie udało się wczytać danych finansowych. Spróbuj zmienić okres.
        </p>
      )}
      {isEmpty && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Brak danych dla wybranego okresu.</p>
      )}

      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
            Przychody a wydatki
          </CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              Brak danych dla wybranego okresu.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fin-revenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fin-expenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} width={72} />
                <Tooltip formatter={(v: number) => formatAmount(v, currency)} />
                <Area type="monotone" dataKey="Revenue" stroke="#10b981" strokeWidth={2} fill="url(#fin-revenue)" />
                <Area type="monotone" dataKey="Expenses" stroke="#ef4444" strokeWidth={2} fill="url(#fin-expenses)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {range && (
        <FinancialDrillDown
          kind={drillDown}
          range={range}
          currency={currency}
          onClose={() => setDrillDown(null)}
        />
      )}
    </section>
  );
}

interface SummaryCardProps {
  title: string;
  value: string;
  hint: string;
  tone: 'positive' | 'negative';
  icon: typeof ArrowUpRight;
  loading: boolean;
  onClick?: () => void;
}

function SummaryCard({ title, value, hint, tone, icon: Icon, loading, onClick }: SummaryCardProps) {
  const isPositive = tone === 'positive';
  const content = (
    <CardContent className="pt-6 pb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          {loading ? (
            <div className="mt-2 h-8 w-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          ) : (
            <p
              className={cn(
                'mt-2 text-2xl font-semibold tabular-nums',
                isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              )}
            >
              {value}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>
        </div>
        <div
          className={cn(
            'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg',
            isPositive ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </CardContent>
  );

  const base = 'border-slate-200 dark:border-slate-800 transition-shadow duration-200 hover:shadow-md';
  if (!onClick) return <Card className={base}>{content}</Card>;
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(base, 'cursor-pointer focus-ring')}
      aria-label={`${title} details`}
    >
      {content}
    </Card>
  );
}
