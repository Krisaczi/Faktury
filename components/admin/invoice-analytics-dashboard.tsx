'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { FileText, TrendingUp, CircleCheck as CheckCircle2, CircleAlert as AlertCircle, Clock, Download, Filter, Loader as Loader2, ChartBar as BarChart2, CalendarDays } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { MonthlyRow, StatusRow, KpiSummary } from '@/app/(admin)/admin/invoices/analytics/page';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  monthly:     MonthlyRow[];
  byStatus:    StatusRow[];
  kpi:         KpiSummary;
  initialFrom: string;
  initialTo:   string;
  companyId:   string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft:        'Szkic',
  issued:       'Wystawiona',
  sent_to_ksef: 'Wysłana do KSeF',
  accepted:     'Zaakceptowana',
  rejected:     'Odrzucona',
  cancelled:    'Anulowana',
};

const STATUS_COLORS: Record<string, string> = {
  draft:        '#94a3b8',
  issued:       '#3b82f6',
  sent_to_ksef: '#f59e0b',
  accepted:     '#10b981',
  rejected:     '#ef4444',
  cancelled:    '#64748b',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('pl-PL', {
    style:    'currency',
    currency: 'PLN',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtMonthLabel(ym: string) {
  try { return format(parseISO(`${ym}-01`), 'MMM yyyy', { locale: pl }); } catch { return ym; }
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accent,
}: {
  label:  string;
  value:  string;
  sub?:   string;
  icon:   React.ElementType;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', accent)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title, icon: Icon, children, action,
}: {
  title:    string;
  icon:     React.ElementType;
  children: React.ReactNode;
  action?:  React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?:  boolean;
  payload?: { name: string; value: number; color: string }[];
  label?:   string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-3 text-xs space-y-1.5">
      <p className="font-semibold text-slate-600 dark:text-slate-300 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
            {typeof p.value === 'number' && p.value > 100
              ? fmtCurrency(p.value)
              : p.value.toLocaleString('pl-PL')}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Export controls ──────────────────────────────────────────────────────────

function ExportButtons({
  from, to, status,
}: {
  from:   string;
  to:     string;
  status: string;
}) {
  const [isDownloading, setIsDownloading] = useState<'csv' | 'xlsx' | null>(null);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (from)   p.set('from',   from);
    if (to)     p.set('to',     to);
    if (status) p.set('status', status);
    return p.toString() ? `?${p.toString()}` : '';
  }, [from, to, status]);

  async function download(fmt: 'csv' | 'xlsx') {
    setIsDownloading(fmt);
    try {
      const qs = buildQuery();
      const res = await fetch(`/api/admin/invoices/export/${fmt}${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `faktury-${new Date().toISOString().slice(0, 10)}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => download('csv')}
        disabled={isDownloading !== null}
        className="gap-1.5 text-xs"
      >
        {isDownloading === 'csv'
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Download className="w-3.5 h-3.5" />}
        CSV
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => download('xlsx')}
        disabled={isDownloading !== null}
        className="gap-1.5 text-xs"
      >
        {isDownloading === 'xlsx'
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Download className="w-3.5 h-3.5" />}
        Excel
      </Button>
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({
  from, to, status, onChange,
}: {
  from:     string;
  to:       string;
  status:   string;
  onChange: (from: string, to: string, status: string) => void;
}) {
  const [localFrom,   setLocalFrom]   = useState(from);
  const [localTo,     setLocalTo]     = useState(to);
  const [localStatus, setLocalStatus] = useState(status);
  const [, startT] = useTransition();

  function apply() {
    startT(() => onChange(localFrom, localTo, localStatus));
  }

  const inputCls = 'h-8 px-3 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40';

  return (
    <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mr-1">
        <Filter className="w-3.5 h-3.5" />
        Filtry
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Od</label>
        <input
          type="date"
          value={localFrom}
          onChange={e => setLocalFrom(e.target.value)}
          className={inputCls}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Do</label>
        <input
          type="date"
          value={localTo}
          onChange={e => setLocalTo(e.target.value)}
          className={inputCls}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Status</label>
        <select
          value={localStatus}
          onChange={e => setLocalStatus(e.target.value)}
          className={inputCls}
        >
          <option value="">Wszystkie</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <Button size="sm" onClick={apply} className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs px-4 self-end">
        Zastosuj
      </Button>
      {(localFrom || localTo || localStatus) && (
        <Button
          size="sm" variant="ghost"
          onClick={() => { setLocalFrom(''); setLocalTo(''); setLocalStatus(''); onChange('', '', ''); }}
          className="h-8 text-xs text-slate-400 hover:text-slate-600 self-end"
        >
          Wyczyść
        </Button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InvoiceAnalyticsDashboard({
  monthly, byStatus, kpi,
  initialFrom, initialTo,
}: Props) {
  const router   = useRouter();
  const pathname = usePathname();

  const [from,   setFrom]   = useState(initialFrom);
  const [to,     setTo]     = useState(initialTo);
  const [status, setStatus] = useState('');

  function applyFilters(newFrom: string, newTo: string, newStatus: string) {
    setFrom(newFrom); setTo(newTo); setStatus(newStatus);
    const p = new URLSearchParams();
    if (newFrom)   p.set('from',   newFrom);
    if (newTo)     p.set('to',     newTo);
    if (newStatus) p.set('status', newStatus);
    router.push(`${pathname}?${p.toString()}`);
  }

  // Chart-ready monthly data
  const monthlyChartData = monthly.map(r => ({
    month:       fmtMonthLabel(r.month),
    'Liczba':    r.invoice_count,
    'Netto PLN': Math.round(r.net_total),
    'Brutto PLN': Math.round(r.gross_total),
  }));

  // Pie chart data
  const pieData = byStatus.map(r => ({
    name:  STATUS_LABELS[r.status] ?? r.status,
    value: r.invoice_count,
    color: STATUS_COLORS[r.status] ?? '#94a3b8',
  }));

  // Status table totals
  const grandTotal = byStatus.reduce((s, r) => s + r.invoice_count, 0) || 1;

  return (
    <div className="space-y-5">

      {/* Filter bar */}
      <FilterBar
        from={from} to={to} status={status}
        onChange={applyFilters}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Faktur łącznie"
          value={kpi.total_invoices.toLocaleString('pl-PL')}
          sub={`Netto: ${fmtCurrency(kpi.total_net)}`}
          icon={FileText}
          accent="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
        />
        <KpiCard
          label="Wartość brutto"
          value={fmtCurrency(kpi.total_gross)}
          sub={`VAT: ${fmtCurrency(kpi.total_vat)}`}
          icon={TrendingUp}
          accent="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
        />
        <KpiCard
          label="Zaakceptowane KSeF"
          value={kpi.accepted_count.toLocaleString('pl-PL')}
          sub={kpi.total_invoices > 0
            ? `${Math.round((kpi.accepted_count / kpi.total_invoices) * 100)}% wszystkich`
            : undefined}
          icon={CheckCircle2}
          accent="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
        />
        <KpiCard
          label="Oczekuje / Odrzucone"
          value={`${kpi.pending_ksef_count} / ${kpi.rejected_count}`}
          sub="oczekuje na KSeF / odrzucone"
          icon={kpi.rejected_count > 0 ? AlertCircle : Clock}
          accent={kpi.rejected_count > 0
            ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'}
        />
      </div>

      {/* Monthly bars — invoice counts */}
      <Section
        title="Liczba faktur miesięcznie"
        icon={BarChart2}
        action={
          <ExportButtons from={from} to={to} status={status} />
        }
      >
        {monthlyChartData.length === 0 ? (
          <EmptyChart message="Brak danych dla wybranego zakresu dat." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={32}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="Liczba" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* Two-column row */}
      <div className="grid md:grid-cols-2 gap-5">

        {/* Monthly amounts area chart */}
        <Section title="Kwoty miesięczne (PLN)" icon={TrendingUp}>
          {monthlyChartData.length === 0 ? (
            <EmptyChart message="Brak danych." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={monthlyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradGross" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  axisLine={false} tickLine={false} width={48}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  iconType="circle" iconSize={8}
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                />
                <Area
                  type="monotone" dataKey="Netto PLN"
                  stroke="#3b82f6" strokeWidth={2}
                  fill="url(#gradNet)" dot={false}
                />
                <Area
                  type="monotone" dataKey="Brutto PLN"
                  stroke="#10b981" strokeWidth={2}
                  fill="url(#gradGross)" dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* Status breakdown */}
        <Section title="Podział według statusu" icon={CalendarDays}>
          {byStatus.length === 0 ? (
            <EmptyChart message="Brak danych." />
          ) : (
            <div className="flex flex-col gap-4">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={44}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, name: string) => [v.toLocaleString('pl-PL'), name]}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 11,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Legend table */}
              <div className="space-y-1.5">
                {byStatus.map(r => {
                  const pct = Math.round((r.invoice_count / grandTotal) * 100);
                  const color = STATUS_COLORS[r.status] ?? '#94a3b8';
                  return (
                    <div key={r.status} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-slate-600 dark:text-slate-300 truncate">
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                        <Badge
                          variant="outline"
                          className="text-xs px-2 py-0 font-mono tabular-nums"
                          style={{ color, borderColor: color + '40' }}
                        >
                          {pct}%
                        </Badge>
                        <span className="tabular-nums text-slate-700 dark:text-slate-300 font-medium w-6 text-right">
                          {r.invoice_count}
                        </span>
                        <span className="tabular-nums text-slate-400 w-24 text-right">
                          {fmtCurrency(r.gross_total)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* Full status table */}
      <Section title="Szczegóły według statusu" icon={FileText}>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                {['Status', 'Liczba', 'Netto', 'VAT', 'Brutto', '% łącznie'].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50/50 dark:bg-slate-800/30 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byStatus.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">
                    Brak faktur dla wybranych filtrów.
                  </td>
                </tr>
              ) : byStatus.map(r => {
                const pct = Math.round((r.invoice_count / grandTotal) * 100);
                const color = STATUS_COLORS[r.status] ?? '#94a3b8';
                return (
                  <tr
                    key={r.status}
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-3 tabular-nums text-slate-800 dark:text-slate-200 font-semibold">
                      {r.invoice_count.toLocaleString('pl-PL')}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-400 text-right whitespace-nowrap">
                      {fmtCurrency(r.net_total)}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-slate-500 text-right whitespace-nowrap">
                      {fmtCurrency(r.gross_total - r.net_total)}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-slate-800 dark:text-slate-200 font-medium text-right whitespace-nowrap">
                      {fmtCurrency(r.gross_total)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-slate-400 w-8 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {byStatus.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 dark:border-slate-700">
                <tr>
                  <td className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Razem
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-900 dark:text-white font-bold">
                    {kpi.total_invoices.toLocaleString('pl-PL')}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-700 dark:text-slate-300 font-semibold text-right whitespace-nowrap">
                    {fmtCurrency(kpi.total_net)}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-400 font-semibold text-right whitespace-nowrap">
                    {fmtCurrency(kpi.total_vat)}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-900 dark:text-white font-bold text-right whitespace-nowrap">
                    {fmtCurrency(kpi.total_gross)}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">100%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Section>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-sm text-slate-400">{message}</div>
  );
}
