'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Building2, Users, FileText, TrendingUp, MoveHorizontal as MoreHorizontal, CircleCheck as CheckCircle2, Circle as XCircle, Loader as Loader2, Tag, ChevronDown, ChevronUp, ShieldAlert, Receipt, Search, X, RefreshCw, Clock, History, Zap, Star } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  setCompanyActiveState,
  assignPricingTier,
  bulkAssignPricingTier,
  bulkDeactivateCompanies,
} from '@/app/(admin)/admin/owner/actions';
import type {
  OwnerDashboardData,
  CompanyDashboardRow,
  PricingTier,
  OwnerAuditLog,
} from '@/app/(admin)/admin/owner/types';

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(n);
}
function fmtMonth(ym: string) {
  try { return format(parseISO(`${ym}-01`), 'MMM yy', { locale: pl }); } catch { return ym; }
}
function fmtDate(d: string | null) {
  if (!d) return '—';
  try { return format(parseISO(d), 'd MMM yyyy', { locale: pl }); } catch { return d; }
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent: string;
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
        <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title, icon: Icon, children, action,
}: {
  title: string; icon: React.ElementType; children: React.ReactNode; action?: React.ReactNode;
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

// ─── Deactivate dialog ────────────────────────────────────────────────────────

function DeactivateDialog({
  company, onConfirm, onCancel,
}: {
  company: CompanyDashboardRow;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Dezaktywuj firmę</h3>
            <p className="text-xs text-slate-400">{company.company_name}</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Dezaktywacja zablokuje dostęp do modułu fakturowania. Możesz podać powód.
        </p>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Powód dezaktywacji (opcjonalnie)"
          className="text-sm"
          aria-label="Powód dezaktywacji"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>Anuluj</Button>
          <Button
            size="sm"
            onClick={() => onConfirm(reason)}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Dezaktywuj
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Pricing modal ────────────────────────────────────────────────────────────

function PricingModal({
  company, tiers, onClose,
}: {
  company: CompanyDashboardRow;
  tiers: PricingTier[];
  onClose: (refresh: boolean) => void;
}) {
  const [selectedTier, setSelectedTier] = useState(company.pricing_tier_id ?? '');
  const [customPrice, setCustomPrice]   = useState<string>(
    company.custom_pricing ? String(company.custom_pricing.price_cents / 100) : ''
  );
  const [useCustom, setUseCustom]       = useState(!!company.custom_pricing);
  const [error, setError]               = useState<string | null>(null);
  const [isPending, start]              = useTransition();

  const currentTier = tiers.find((t) => t.id === selectedTier);

  function handleSave() {
    setError(null);
    start(async () => {
      const customPricing = useCustom && customPrice
        ? { currency: 'PLN', price_cents: Math.round(parseFloat(customPrice) * 100), billing_period: 'monthly' as const }
        : null;

      const res = await assignPricingTier(company.company_id, selectedTier || null, customPricing);
      if (res.ok) onClose(true);
      else setError(res.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onClose(false)} aria-hidden="true" />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <Tag className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Zarządzaj cennikiem</h2>
              <p className="text-xs text-slate-400">{company.company_name}</p>
            </div>
          </div>
          <button onClick={() => onClose(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Zamknij">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Tier selector */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Wybierz plan</p>
            {tiers.map((tier) => (
              <label
                key={tier.id}
                className={cn(
                  'flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all',
                  selectedTier === tier.id && !useCustom
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                )}
              >
                <input
                  type="radio"
                  name="tier"
                  value={tier.id}
                  checked={selectedTier === tier.id && !useCustom}
                  onChange={() => { setSelectedTier(tier.id); setUseCustom(false); }}
                  className="accent-blue-600"
                  aria-label={tier.name}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{tier.name}</p>
                  <p className="text-xs text-slate-400">
                    {fmtCurrency(tier.monthly_price_cents / 100)}/mies · {fmtCurrency(tier.annual_price_cents / 100)}/rok
                  </p>
                </div>
                {selectedTier === tier.id && !useCustom && (
                  <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                )}
              </label>
            ))}

            {/* Custom pricing */}
            <label className={cn(
              'flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all',
              useCustom ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
            )}>
              <input
                type="radio"
                name="tier"
                checked={useCustom}
                onChange={() => setUseCustom(true)}
                className="mt-0.5 accent-blue-600"
                aria-label="Cennik niestandardowy"
              />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Cena niestandardowa</p>
                {useCustom && (
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    placeholder="Cena miesięczna (PLN)"
                    className="h-8 text-sm"
                    aria-label="Cena niestandardowa"
                  />
                )}
              </div>
            </label>
          </div>

          {/* Preview */}
          {(currentTier || useCustom) && (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <p className="font-semibold text-slate-700 dark:text-slate-200">Podgląd rozliczenia</p>
              {useCustom && customPrice
                ? <p>Miesięcznie: {fmtCurrency(parseFloat(customPrice) || 0)}</p>
                : currentTier && (
                  <>
                    <p>Miesięcznie: {fmtCurrency(currentTier.monthly_price_cents / 100)}</p>
                    <p>Rocznie: {fmtCurrency(currentTier.annual_price_cents / 100)}</p>
                  </>
                )
              }
            </div>
          )}

          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onClose(false)}>Anuluj</Button>
            <Button size="sm" onClick={handleSave} disabled={isPending} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Zapisz
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Companies table ──────────────────────────────────────────────────────────

function CompaniesTable({
  companies, tiers, onRefresh,
}: {
  companies: CompanyDashboardRow[];
  tiers: PricingTier[];
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [search, setSearch]           = useState('');
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [deactivateTarget, setDeactivateTarget] = useState<CompanyDashboardRow | null>(null);
  const [pricingTarget, setPricingTarget]       = useState<CompanyDashboardRow | null>(null);
  const [sortKey, setSortKey]         = useState<'company_name' | 'invoices_30d' | 'last_invoice_date'>('company_name');
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('asc');
  const [isPending, start]            = useTransition();
  const [bulkTier, setBulkTier]       = useState('');

  const filtered = companies
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return c.company_name.toLowerCase().includes(q) || (c.nip ?? '').includes(q);
    })
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'invoices_30d') return (a.invoices_30d - b.invoices_30d) * mul;
      if (sortKey === 'last_invoice_date') {
        return ((a.last_invoice_date ?? '') < (b.last_invoice_date ?? '') ? -1 : 1) * mul;
      }
      return a.company_name.localeCompare(b.company_name, 'pl') * mul;
    });

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function SortIcon({ k }: { k: typeof sortKey }) {
    if (sortKey !== k) return null;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  }

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.company_id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.company_id)));
  }

  function handleDeactivate(company: CompanyDashboardRow, reason: string) {
    start(async () => {
      await setCompanyActiveState(company.company_id, false, reason);
      setDeactivateTarget(null);
      onRefresh();
    });
  }

  function handleReactivate(company: CompanyDashboardRow) {
    start(async () => {
      await setCompanyActiveState(company.company_id, true);
      onRefresh();
    });
  }

  function handleBulkDeactivate() {
    if (selected.size === 0) return;
    start(async () => {
      await bulkDeactivateCompanies(Array.from(selected), 'Dezaktywacja grupowa');
      setSelected(new Set());
      onRefresh();
    });
  }

  function handleBulkTier() {
    if (!bulkTier || selected.size === 0) return;
    start(async () => {
      await bulkAssignPricingTier(Array.from(selected), bulkTier);
      setSelected(new Set());
      setBulkTier('');
      onRefresh();
    });
  }

  return (
    <>
      {/* Toolbar */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj firmy, NIP..."
              className="pl-9 h-9 text-sm"
              aria-label="Szukaj firm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Wyczyść">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={onRefresh} disabled={isPending}>
            <RefreshCw className={cn('w-3.5 h-3.5', isPending && 'animate-spin')} />
            Odśwież
          </Button>
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 flex-wrap">
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
              {selected.size} zaznaczonych
            </span>
            <select
              value={bulkTier}
              onChange={(e) => setBulkTier(e.target.value)}
              className="text-xs h-7 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2"
              aria-label="Wybierz plan dla zaznaczonych"
            >
              <option value="">Przypisz plan...</option>
              {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleBulkTier} disabled={!bulkTier || isPending}>
              Zastosuj plan
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={handleBulkDeactivate} disabled={isPending}>
              Dezaktywuj
            </Button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-slate-400 hover:text-slate-600" aria-label="Wyczyść zaznaczenie">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto mt-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm" aria-label="Lista firm właściciela">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="accent-blue-600"
                  aria-label="Zaznacz wszystkie"
                />
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none" onClick={() => toggleSort('company_name')}>
                Firma <SortIcon k="company_name" />
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Produkt</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Plan</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hidden lg:table-cell" onClick={() => toggleSort('invoices_30d')}>
                Faktury 30d <SortIcon k="invoices_30d" />
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Netto 30d</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden xl:table-cell cursor-pointer select-none" onClick={() => toggleSort('last_invoice_date')}>
                Ostatnia faktura <SortIcon k="last_invoice_date" />
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Dostawcy</th>
              <th className="px-4 py-3 w-12" aria-label="Akcje" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-16 text-sm text-slate-400">
                  {search ? 'Brak wyników wyszukiwania.' : 'Brak firm.'}
                </td>
              </tr>
            )}
            {filtered.map((company) => (
              <tr
                key={company.company_id}
                className={cn(
                  'group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                  selected.has(company.company_id) && 'bg-blue-50/40 dark:bg-blue-900/10'
                )}
              >
                <td className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={selected.has(company.company_id)}
                    onChange={(e) => setSelected((prev) => {
                      const next = new Set(prev);
                      e.target.checked ? next.add(company.company_id) : next.delete(company.company_id);
                      return next;
                    })}
                    className="accent-blue-600"
                    aria-label={`Zaznacz ${company.company_name}`}
                  />
                </td>
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white text-sm">{company.company_name}</p>
                    {company.nip && <p className="text-xs text-slate-400 tabular-nums">{company.nip}</p>}
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {company.is_active
                    ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />Aktywna
                      </span>
                    : <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                        <XCircle className="w-3.5 h-3.5" />Nieaktywna
                      </span>}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {(() => {
                    const pt = company.product_type;
                    if (pt === 'professional') return (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <Star className="w-3 h-3" />Professional
                        {company.trial_active && (
                          <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded px-1 py-0.5">
                            <Clock className="w-2.5 h-2.5" />Trial
                          </span>
                        )}
                      </span>
                    );
                    if (pt === 'starter') return (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                        <Zap className="w-3 h-3" />Starter
                        {company.trial_active && (
                          <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded px-1 py-0.5">
                            <Clock className="w-2.5 h-2.5" />Trial
                          </span>
                        )}
                      </span>
                    );
                    return <span className="text-xs text-slate-300 dark:text-slate-600">—</span>;
                  })()}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {company.pricing_tier_name
                    ? <Badge variant="secondary" className="text-[10px] font-medium">{company.pricing_tier_name}</Badge>
                    : company.custom_pricing
                      ? <Badge variant="secondary" className="text-[10px] font-medium bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400">Niestandardowy</Badge>
                      : <span className="text-xs text-slate-300 dark:text-slate-600">—</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300 hidden lg:table-cell">
                  {company.invoices_30d}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300 hidden lg:table-cell">
                  {fmtCurrency(company.net_total_30d)}
                </td>
                <td className="px-4 py-3 text-right text-xs text-slate-400 hidden xl:table-cell">
                  {fmtDate(company.last_invoice_date)}
                </td>
                <td className="px-4 py-3 text-right text-slate-500 hidden md:table-cell">
                  {company.vendors_count}
                </td>
                <td className="px-4 py-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors" aria-label="Akcje">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setPricingTarget(company)} className="gap-2">
                        <Tag className="w-4 h-4" />Cennik
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/admin/invoices/new?buyer_company_id=${company.company_id}`} className={cn('flex items-center gap-2', !company.is_active && 'opacity-50 pointer-events-none')}>
                          <Receipt className="w-4 h-4" />Nowa faktura
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {company.is_active
                        ? <DropdownMenuItem onClick={() => setDeactivateTarget(company)} className="gap-2 text-red-600 focus:text-red-600">
                            <XCircle className="w-4 h-4" />Dezaktywuj
                          </DropdownMenuItem>
                        : <DropdownMenuItem onClick={() => handleReactivate(company)} className="gap-2 text-emerald-600 focus:text-emerald-600">
                            <CheckCircle2 className="w-4 h-4" />Aktywuj
                          </DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dialogs */}
      {deactivateTarget && (
        <DeactivateDialog
          company={deactivateTarget}
          onConfirm={(r) => handleDeactivate(deactivateTarget, r)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
      {pricingTarget && (
        <PricingModal
          company={pricingTarget}
          tiers={tiers}
          onClose={(refresh) => { setPricingTarget(null); if (refresh) onRefresh(); }}
        />
      )}
    </>
  );
}

// ─── Trend chart tooltip ──────────────────────────────────────────────────────

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
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
            {typeof p.value === 'number' && p.name.includes('PLN') ? fmtCurrency(p.value) : p.value.toLocaleString('pl-PL')}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Audit log list ───────────────────────────────────────────────────────────

const AUDIT_LABELS: Record<string, string> = {
  assign_pricing_tier:    'Przypisano cennik',
  activate_company:       'Aktywowano firmę',
  deactivate_company:     'Dezaktywowano firmę',
  bulk_assign_pricing_tier: 'Grupowe przypisanie cennika',
  bulk_deactivate:        'Grupowa dezaktywacja',
};

function AuditList({ logs }: { logs: OwnerAuditLog[] }) {
  if (logs.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-6">Brak wpisów w dzienniku.</p>;
  }
  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li key={log.id} className="flex items-start gap-3 py-2 border-b border-slate-50 dark:border-slate-800 last:border-0">
          <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {AUDIT_LABELS[log.action] ?? log.action}
            </p>
            {log.company_id && (
              <p className="text-xs text-slate-400 truncate">{log.company_id}</p>
            )}
          </div>
          <time className="text-xs text-slate-400 tabular-nums flex-shrink-0">
            {fmtDate(log.created_at)}
          </time>
        </li>
      ))}
    </ul>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

interface Props {
  data:      OwnerDashboardData;
  auditLogs: OwnerAuditLog[];
}

export function OwnerDashboard({ data: initialData, auditLogs: initialLogs }: Props) {
  const router    = useRouter();
  const [data, setData] = useState(initialData);

  const handleRefresh = useCallback(() => router.refresh(), [router]);

  const { companies, trend, pricingTiers, kpi } = data;

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Firmy aktywne"
          value={`${kpi.active_companies} / ${kpi.total_companies}`}
          sub="łącznie zarejestrowanych"
          icon={Building2}
          accent="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
        />
        <KpiCard
          label="Faktury (30 dni)"
          value={kpi.total_invoices_30d}
          sub="wszystkie firmy"
          icon={FileText}
          accent="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
        />
        <KpiCard
          label="Obrót netto 30d"
          value={fmtCurrency(kpi.total_net_30d)}
          sub="suma wszystkich firm"
          icon={TrendingUp}
          accent="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
        />
        <KpiCard
          label="Użytkownicy"
          value={kpi.total_users}
          sub={`${kpi.total_vendors} dostawców`}
          icon={Users}
          accent="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
        />
      </div>

      {/* Trend chart */}
      {trend.length > 0 && (
        <Section title="Trend fakturowania" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trend.map((r) => ({ ...r, month: fmtMonth(r.month) }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ownerGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.6} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="net_total" name="Netto (PLN)" stroke="#3b82f6" fill="url(#ownerGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Section>
      )}

      {/* Companies table */}
      <Section title="Firmy" icon={Building2}>
        <CompaniesTable
          companies={companies}
          tiers={pricingTiers}
          onRefresh={handleRefresh}
        />
      </Section>

      {/* Audit log */}
      <Section title="Dziennik zdarzeń" icon={History}>
        <AuditList logs={initialLogs} />
      </Section>
    </div>
  );
}
