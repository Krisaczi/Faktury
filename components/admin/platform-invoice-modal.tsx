'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { Loader as Loader2, FileText, Send, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Eye, Save, Ban, Calendar, Receipt, Info, Percent } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import type { CompanyUser } from '@/lib/auth/role-actions';
import { computeTax, VAT_PRESETS } from '@/lib/tax-calc';

interface LineItem {
  description:      string;
  quantity:         number;
  unitPriceCents:   number;
  taxable:          boolean;
  vatRate:          number | null;
}

interface UsageData {
  company: { id: string; name: string; nip: string; city: string; street: string; postalCode: string; productType: string; isActive: boolean };
  plan:    { key: string; name: string; monthlyPriceCents: number; limits: Record<string, number | null> | null };
  usage:   { activeUsers: number; vendorCount: number; invoiceCount: number; reportCount: number; issuedInvoiceCount: number };
  period:  { year: number; month: number; start: string; end: string; label: string };
}

const MONTHS_PL = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

function formatCents(c: number): string {
  return `${(c / 100).toFixed(2)} zł`;
}

function generateMonthOptions(): { value: string; label: string; year: number; month: number }[] {
  const now = new Date();
  const options: { value: string; label: string; year: number; month: number }[] = [];
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    options.push({ value: val, label: `${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}`, year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return options;
}

export function PlatformInvoiceModal({
  user,
  open,
  onOpenChange,
  onSuccess,
}: {
  user:       CompanyUser;
  open:       boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess:  () => void;
}) {
  const [step, setStep]               = useState<'loading' | 'form' | 'preview' | 'success' | 'error'>('loading');
  const [usage, setUsage]             = useState<UsageData | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [period, setPeriod]           = useState('');
  const [lineItems, setLineItems]     = useState<LineItem[]>([]);
  const [notes, setNotes]             = useState('');
  const [internalRef, setInternalRef] = useState('');
  const [draftId, setDraftId]         = useState<string | null>(null);
  const [isPending, start]            = useTransition();
  const monthOptions                  = generateMonthOptions();

  // VAT state
  const [vatRate, setVatRate]               = useState<number>(0);
  const [customVatRate, setCustomVatRate]   = useState<string>('');
  const [vatMode, setVatMode]               = useState<'invoice' | 'per_line'>('invoice');
  const [priceIncludesTax, setPriceIncludesTax] = useState(false);
  const [vatNumber, setVatNumber]           = useState('');
  const [defaultVatRate, setDefaultVatRate] = useState<number | null>(null);
  const [vatConfirmed, setVatConfirmed]     = useState(false);

  const effectiveVatRate = customVatRate !== '' ? Number(customVatRate) : vatRate;

  const fetchUsage = useCallback((periodValue: string) => {
    setError(null);
    setStep('loading');
    start(async () => {
      try {
        const [y, m] = periodValue.split('-');
        const res = await fetch(`/api/owner/users/${user.id}/usage?period=${periodValue}`);
        if (!res.ok) { setError('Błąd ładowania danych.'); setStep('error'); return; }
        const data = await res.json() as UsageData;
        setUsage(data);

        // Fetch company tax config
        const taxRes = await fetch(`/api/owner/companies/${data.company.id}/tax-config`);
        if (taxRes.ok) {
          const taxData = await taxRes.json() as { defaultVatRate: number | null; defaultVatNumber: string | null };
          if (taxData.defaultVatRate != null) {
            setVatRate(taxData.defaultVatRate);
            setDefaultVatRate(taxData.defaultVatRate);
          } else {
            setVatRate(0);
            setDefaultVatRate(null);
          }
          setVatNumber(taxData.defaultVatNumber ?? '');
        }

        // Auto-populate line items based on plan
        const items: LineItem[] = [{
          description: `Abonament platformowy — ${data.plan.name} (${MONTHS_PL[Number(m) - 1]} ${y})`,
          quantity:       1,
          unitPriceCents: data.plan.monthlyPriceCents,
          taxable:        true,
          vatRate:        null,
        }];

        if (data.plan.limits?.users_limit && data.usage.activeUsers > data.plan.limits.users_limit) {
          const extra = data.usage.activeUsers - data.plan.limits.users_limit;
          items.push({
            description: `Dodatkowi użytkownicy (${extra} powyżej limitu)`,
            quantity:       extra,
            unitPriceCents: 2000,
            taxable:        true,
            vatRate:        null,
          });
        }

        setLineItems(items);
        setStep('form');
      } catch {
        setError('Błąd połączenia.');
        setStep('error');
      }
    });
  }, [user.id]);

  useEffect(() => {
    if (open && !usage) {
      const defaultPeriod = monthOptions[0]?.value ?? '';
      setPeriod(defaultPeriod);
      fetchUsage(defaultPeriod);
    }
    if (!open) {
      setStep('loading'); setUsage(null); setError(null); setDraftId(null);
      setLineItems([]); setVatRate(0); setCustomVatRate(''); setVatNumber('');
      setVatMode('invoice'); setPriceIncludesTax(false); setVatConfirmed(false);
      setDefaultVatRate(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function computeTotals() {
    const result = computeTax(
      lineItems.map((li) => ({
        description:      li.description,
        quantity:         li.quantity,
        unitPriceCents:   li.unitPriceCents,
        taxable:          li.taxable,
        vatRatePercent:   vatMode === 'per_line' ? (li.vatRate ?? effectiveVatRate) : effectiveVatRate,
      })),
      effectiveVatRate,
      priceIncludesTax,
    );
    return result;
  }

  const totals = computeTotals();

  function updateLineItem(idx: number, field: keyof LineItem, value: string | number | boolean | null) {
    setLineItems((prev) => prev.map((li, i) => i === idx ? { ...li, [field]: value } : li));
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, { description: '', quantity: 1, unitPriceCents: 0, taxable: true, vatRate: null }]);
  }

  function removeLineItem(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveDraft() {
    setError(null);
    start(async () => {
      try {
        const [y, m] = period.split('-');
        const res = await fetch('/api/owner/invoices/draft', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            entityId:         usage!.company.id,
            entityType:       'company',
            periodYear:       Number(y),
            periodMonth:      Number(m),
            lineItems:        lineItems.map((li) => ({
              description:    li.description,
              quantity:       li.quantity,
              unitPriceCents: Math.round(li.unitPriceCents),
              taxable:        li.taxable,
              vatRate:        vatMode === 'per_line' ? li.vatRate : undefined,
            })),
            notes:            notes || undefined,
            internalReference: internalRef || undefined,
            vatRate:          effectiveVatRate,
            vatMode,
            priceIncludesTax,
            vatNumber:        vatNumber || undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Błąd' }));
          setError(err.error ?? 'Błąd tworzenia szkicu.');
          return;
        }
        const data = await res.json() as { id: string };
        setDraftId(data.id);
        setStep('preview');
      } catch {
        setError('Błąd połączenia.');
      }
    });
  }

  async function issueInvoice() {
    if (!draftId) return;
    setError(null);
    start(async () => {
      try {
        const res = await fetch(`/api/owner/invoices/${draftId}/issue`, { method: 'POST' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Błąd' }));
          setError(err.error ?? 'Błąd wystawiania.');
          return;
        }
        setStep('success');
        await fetch(`/api/owner/invoices/${draftId}/send`, { method: 'POST' });
      } catch {
        setError('Błąd połączenia.');
      }
    });
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-blue-600" />
            Faktura za użytkowanie platformy
          </DialogTitle>
          <DialogDescription>
            Wystaw fakturę dla: <strong>{user.full_name ?? user.email}</strong>
          </DialogDescription>
        </DialogHeader>

        {/* Loading */}
        {step === 'loading' && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
          </div>
        )}

        {/* Error loading */}
        {step === 'error' && (
          <div className="py-8 text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => fetchUsage(period)}>
              Spróbuj ponownie
            </Button>
          </div>
        )}

        {/* Form step */}
        {step === 'form' && usage && (
          <div className="space-y-5">
            {/* Period selector */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Okres rozliczeniowy
              </Label>
              <Select value={period} onValueChange={(v) => { setPeriod(v); fetchUsage(v); }}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Usage metrics */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-blue-500" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                  Metryki użycia — {usage.period.label}
                </p>
              </div>
              <div className="grid grid-cols-5 gap-2 text-center">
                <div><p className="text-xs text-slate-400">Plan</p><p className="text-sm font-medium text-slate-700 dark:text-slate-300">{usage.plan.name}</p></div>
                <div><p className="text-xs text-slate-400">Użytkownicy</p><p className="text-sm font-medium text-slate-700 dark:text-slate-300">{usage.usage.activeUsers}</p></div>
                <div><p className="text-xs text-slate-400">Dostawcy</p><p className="text-sm font-medium text-slate-700 dark:text-slate-300">{usage.usage.vendorCount}</p></div>
                <div><p className="text-xs text-slate-400">Faktury</p><p className="text-sm font-medium text-slate-700 dark:text-slate-300">{usage.usage.invoiceCount}</p></div>
                <div><p className="text-xs text-slate-400">Wystawione</p><p className="text-sm font-medium text-slate-700 dark:text-slate-300">{usage.usage.issuedInvoiceCount}</p></div>
              </div>
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Pozycje faktury</p>
                <Button variant="outline" size="sm" onClick={addLineItem} className="h-7 text-xs gap-1">
                  <FileText className="w-3 h-3" /> Dodaj pozycję
                </Button>
              </div>
              {lineItems.map((li, idx) => (
                <div key={idx} className="space-y-1.5 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="grid grid-cols-12 gap-2 items-start">
                    <Input className="col-span-5 text-sm h-8" value={li.description} onChange={(e) => updateLineItem(idx, 'description', e.target.value)} placeholder="Opis pozycji" />
                    <Input type="number" min={0.01} step={0.01} className="col-span-2 text-sm h-8" value={li.quantity} onChange={(e) => updateLineItem(idx, 'quantity', Number(e.target.value) || 1)} />
                    <Input type="number" min={0} className="col-span-2 text-sm h-8" value={li.unitPriceCents} onChange={(e) => updateLineItem(idx, 'unitPriceCents', Number(e.target.value) || 0)} placeholder="Cena (gr)" />
                    <div className="col-span-2 text-sm flex items-center h-8">{formatCents(Math.round(li.quantity * li.unitPriceCents))}</div>
                    <Button variant="ghost" size="sm" className="col-span-1 h-8 p-0 text-red-400 hover:text-red-600" onClick={() => removeLineItem(idx)}>
                      <Ban className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {vatMode === 'per_line' && li.taxable && (
                    <div className="flex items-center gap-2 pl-1">
                      <Percent className="w-3 h-3 text-slate-400" />
                      <Input type="number" min={0} max={100} step={0.01} className="h-7 w-24 text-xs" value={li.vatRate ?? ''} onChange={(e) => updateLineItem(idx, 'vatRate', e.target.value === '' ? null : Number(e.target.value))} placeholder="VAT %" />
                      <span className="text-xs text-slate-400">VAT dla tej pozycji (puste = stawka faktury)</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* VAT controls */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-blue-600" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Ustawienia VAT</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* VAT rate */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Stawka VAT</Label>
                  <Select
                    value={customVatRate !== '' ? '__custom' : String(vatRate)}
                    onValueChange={(v) => {
                      if (v === '__custom') { setCustomVatRate(''); return; }
                      setCustomVatRate('');
                      setVatRate(Number(v));
                    }}
                  >
                    <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VAT_PRESETS.map((r) => (
                        <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                      ))}
                      <SelectItem value="__custom">Niestandardowa...</SelectItem>
                    </SelectContent>
                  </Select>
                  {customVatRate !== '' && (
                    <Input type="number" min={0} max={100} step={0.01} className="h-8 text-sm" value={customVatRate} onChange={(e) => setCustomVatRate(e.target.value)} placeholder="np. 12.50" />
                  )}
                  {defaultVatRate == null && (
                    <p className="text-xs text-slate-400">Brak domyślnej stawki VAT dla tej firmy — wybierz stawkę lub ustaw domyślną w Ustawieniach firmy.</p>
                  )}
                </div>

                {/* VAT mode */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Zakres VAT</Label>
                  <Select value={vatMode} onValueChange={(v: 'invoice' | 'per_line') => setVatMode(v)}>
                    <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="invoice">Cała faktura</SelectItem>
                      <SelectItem value="per_line">W każdej pozycji</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Inclusive/exclusive */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Ceny zawierają VAT?</Label>
                  <Select value={priceIncludesTax ? 'yes' : 'no'} onValueChange={(v) => setPriceIncludesTax(v === 'yes')}>
                    <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">Netto (dodaj VAT)</SelectItem>
                      <SelectItem value="yes">Brutto (zawiera VAT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* VAT number */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Numer VAT (opcjonalnie)</Label>
                  <Input className="h-9 text-sm" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="PL1234567890" />
                </div>
              </div>

              <p className="text-xs text-slate-400">
                Skonfiguruj stawki VAT dla firmy. Skonsultuj się z doradcą podatkowym w sprawie zgodności.
              </p>
            </div>

            {/* Live tax summary */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Wartość netto</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{formatCents(totals.subtotalCents)}</span>
              </div>
              {totals.breakdown.map((b, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-slate-500">VAT ({b.vatRatePercent}%)</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">{formatCents(b.taxAmountCents)}</span>
                </div>
              ))}
              <div className="flex justify-between text-base font-bold border-t border-slate-200 dark:border-slate-700 pt-1.5">
                <span className="text-slate-800 dark:text-slate-200">Razem {priceIncludesTax ? 'brutto' : 'brutto'}</span>
                <span className="text-blue-600 dark:text-blue-400">{formatCents(totals.totalCents)}</span>
              </div>
            </div>

            {/* Notes + reference */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Notatki (opcjonalnie)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="notatka na fakturze" className="text-sm resize-none h-16" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Referencja wewnętrzna</Label>
                <Input value={internalRef} onChange={(e) => setInternalRef(e.target.value)} placeholder="np. INT-2026-08" className="text-sm h-9" />
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
          </div>
        )}

        {/* Preview step */}
        {step === 'preview' && usage && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <Eye className="w-4 h-4 text-blue-600" />
              <p className="text-xs text-blue-700 dark:text-blue-400">Podgląd faktury — numer zostanie nadany po wystawieniu.</p>
            </div>

            {/* Invoice preview */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                   <p className="text-xs text-slate-400 mb-1">Wystawca:</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-200">KrisAczi - Krzysztof Mrozowski</p>
                 
                <p className="text-xs text-slate-500">NIP: 5213256335</p>
                <p className="text-xs text-slate-500">ul. Kluczborska 4/77</p> 
                <p className="text-xs text-slate-500">01-461 Warszawa</p>
                  <p className="text-xs text-slate-500">IBAN PL02105010251000009083947912</p>
                  <p className="text-xs text-slate-500">Termin płatności - 14 dni</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Okres: {usage.period.label}</p>
                  <Badge className="mt-1 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400">Szkic</Badge>
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                <p className="text-xs text-slate-400 mb-1">Nabywca:</p>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{usage.company.name}</p>
                <p className="text-xs text-slate-500">NIP: {usage.company.nip || '—'}</p>
                <p className="text-xs text-slate-500">{usage.company.street || '—'}</p> 
                <p className="text-xs text-slate-500">{usage.company.postalCode || '—'} {usage.company.city || '—'}</p>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-xs text-slate-400">
                    <th className="text-left py-2">Opis</th>
                    <th className="text-right py-2 w-16">Ilość</th>
                    <th className="text-right py-2 w-24">Cena</th>
                    <th className="text-right py-2 w-20">VAT</th>
                    <th className="text-right py-2 w-24">Wartość</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li, idx) => {
                    const lineResult = totals.lineItems[idx];
                    return (
                      <tr key={idx} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2 text-slate-700 dark:text-slate-300">{li.description}</td>
                        <td className="text-right text-slate-600 dark:text-slate-400">{li.quantity}</td>
                        <td className="text-right text-slate-600 dark:text-slate-400">{formatCents(li.unitPriceCents)}</td>
                        <td className="text-right text-slate-600 dark:text-slate-400">{lineResult?.taxable ? `${lineResult.vatRatePercent}%` : '—'}</td>
                        <td className="text-right font-medium text-slate-700 dark:text-slate-300">{formatCents(Math.round(li.quantity * li.unitPriceCents))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex justify-end space-y-1 flex-col items-end">
                <div className="flex justify-between w-48 text-sm">
                  <span className="text-slate-500">Netto:</span>
                  <span className="text-slate-700 dark:text-slate-300">{formatCents(totals.subtotalCents)}</span>
                </div>
                {totals.breakdown.map((b, i) => (
                  <div key={i} className="flex justify-between w-48 text-sm">
                    <span className="text-slate-500">VAT ({b.vatRatePercent}%):</span>
                    <span className="text-slate-700 dark:text-slate-300">{formatCents(b.taxAmountCents)}</span>
                  </div>
                ))}
                {vatNumber && (
                  <div className="flex justify-between w-48 text-xs text-slate-400">
                    <span>Numer VAT:</span>
                    <span>{vatNumber}</span>
                  </div>
                )}
                <div className="flex justify-between w-48 text-base font-bold border-t border-slate-200 dark:border-slate-700 pt-1">
                  <span className="text-slate-800 dark:text-slate-200">Brutto:</span>
                  <span className="text-blue-600 dark:text-blue-400">{formatCents(totals.totalCents)}</span>
                </div>
              </div>

              {notes && <p className="text-xs text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-2">Uwagi: {notes}</p>}
            </div>

            {/* VAT confirmation checkbox */}
            {effectiveVatRate > 0 && (
              <label className="flex items-center gap-2 cursor-pointer select-none p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <input
                  type="checkbox"
                  checked={vatConfirmed}
                  onChange={(e) => setVatConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Potwierdzam zastosowanie stawki VAT {effectiveVatRate}% dla tej faktury
                </span>
              </label>
            )}

            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Wystawienie faktury jest nieodwracalne (można ją później cofnąć). Numer faktury zostanie wygenerowany automatycznie.
              </p>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
          </div>
        )}

        {/* Success step */}
        {step === 'success' && (
          <div className="py-8 text-center space-y-3">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Faktura wystawiona i wysłana</p>
            <p className="text-xs text-slate-400">Faktura została wystawiona i wysłana e-mailem do firmy.</p>
          </div>
        )}

        {/* Footer actions */}
        <DialogFooter className="gap-2">
          {step === 'form' && (
            <>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isPending}>Anuluj</Button>
              <Button size="sm" onClick={saveDraft} disabled={isPending || lineItems.length === 0} className="gap-2">
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Zapisz szkic i podgląd
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep('form')} disabled={isPending}>Wróć do edycji</Button>
              <Button
                size="sm"
                onClick={issueInvoice}
                disabled={isPending || (effectiveVatRate > 0 && !vatConfirmed)}
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Wystaw i wyślij
              </Button>
            </>
          )}
          {step === 'success' && (
            <Button size="sm" onClick={() => { onSuccess(); onOpenChange(false); }} className="gap-2">
              <CheckCircle className="w-3.5 h-3.5" /> Gotowe
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
