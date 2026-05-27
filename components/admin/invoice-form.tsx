'use client';

import { useCallback, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Send, Loader, Building2, User, Calendar, CreditCard, Hash, ChevronDown, CircleAlert as AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  computeItemAmounts,
  computeInvoiceTotals,
  VAT_RATES,
  type VatRate,
  type IssuedInvoiceRow,
  type IssuedInvoiceItemRow,
} from '@/types/issued-invoice';
import type { InvoiceFormValues } from '@/app/(admin)/admin/invoices/actions';
import { createInvoice, updateInvoice } from '@/app/(admin)/admin/invoices/actions';

// ─── Local form schema (mirrors InvoiceFormValues) ────────────────────────────

const ItemSchema = z.object({
  name:           z.string().min(1, 'Wymagane'),
  unit:           z.string().min(1).default('szt.'),
  quantity:       z.coerce.number().positive('> 0'),
  unit_price_net: z.coerce.number().min(0, '>= 0'),
  vat_rate:       z.enum(VAT_RATES),
  discount_pct:   z.coerce.number().min(0).max(99.99).nullable().optional(),
});

const FormSchema = z.object({
  invoice_number:      z.string().optional(),
  currency:            z.string().default('PLN'),
  issue_date:          z.string().min(1, 'Wymagane'),
  sale_date:           z.string().optional(),
  due_date:            z.string().optional(),
  payment_method:      z.enum(['transfer', 'cash', 'card', 'other']).default('transfer'),
  seller_name:         z.string().min(1, 'Wymagane'),
  seller_nip:          z.string().regex(/^\d{10}$/, 'Musi zawierać 10 cyfr'),
  seller_address:      z.string().min(1, 'Wymagane'),
  seller_bank_account: z.string().optional(),
  buyer_name:          z.string().min(1, 'Wymagane'),
  buyer_nip:           z.string().regex(/^\d{10}$/, 'Musi zawierać 10 cyfr').optional().or(z.literal('')),
  buyer_address:       z.string().optional(),
  buyer_email:         z.string().email('Nieprawidłowy e-mail').optional().or(z.literal('')),
  notes:               z.string().optional(),
  items:               z.array(ItemSchema).min(1, 'Dodaj co najmniej jedną pozycję'),
});

type LocalFormValues = z.infer<typeof FormSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  mode: 'create' | 'edit';
  invoiceId?: string;
  defaultValues?: Partial<LocalFormValues>;
  sellerDefaults?: {
    name: string;
    nip: string;
    address: string;
    bank_account?: string;
  };
}

const VAT_LABELS: Record<VatRate, string> = {
  '23': '23%', '8': '8%', '5': '5%', '0': '0%',
  'zw': 'Zw.', 'np': 'n.p.', 'oo': 'o.o.',
};

const PAYMENT_LABELS = {
  transfer: 'Przelew bankowy',
  cash:     'Gotówka',
  card:     'Karta płatnicza',
  other:    'Inne',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoiceForm({ mode, invoiceId, defaultValues, sellerDefaults }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [intent, setIntent] = useTransitionState<'draft' | 'issue'>('draft');

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LocalFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      currency:       'PLN',
      payment_method: 'transfer',
      issue_date:     todayISO(),
      ...defaultValues,
      seller_name:    defaultValues?.seller_name    ?? sellerDefaults?.name    ?? '',
      seller_nip:     defaultValues?.seller_nip     ?? sellerDefaults?.nip     ?? '',
      seller_address: defaultValues?.seller_address ?? sellerDefaults?.address ?? '',
      seller_bank_account: defaultValues?.seller_bank_account ?? sellerDefaults?.bank_account ?? '',
      items: defaultValues?.items?.length
        ? defaultValues.items
        : [emptyItem()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  // Live watch for totals computation
  const watchedItems = useWatch({ control, name: 'items' });

  const computedItems = (watchedItems ?? []).map((item) => {
    const q   = Number(item?.quantity ?? 0);
    const p   = Number(item?.unit_price_net ?? 0);
    const vat = (item?.vat_rate ?? '23') as VatRate;
    const disc = item?.discount_pct != null ? Number(item.discount_pct) : null;
    return computeItemAmounts(q, p, vat, disc);
  });

  const totals = computeInvoiceTotals(computedItems);

  const onSubmit = useCallback(
    (intentValue: 'draft' | 'issue') =>
      handleSubmit(async (data: LocalFormValues) => {
        const payload = data as unknown as InvoiceFormValues;

        startTransition(async () => {
          const result =
            mode === 'create'
              ? await createInvoice(payload, intentValue)
              : await updateInvoice(invoiceId!, payload, intentValue);

          if (!result.ok) {
            toast.error('Błąd zapisu', { description: result.error });
            return;
          }

          toast.success(
            intentValue === 'issue' ? 'Faktura wystawiona' : 'Zapisano szkic',
            { description: intentValue === 'issue' ? 'Numer faktury został nadany.' : 'Faktura zapisana jako szkic.' },
          );
          router.push(`/admin/invoices/${result.id}`);
        });
      })(),
    [handleSubmit, mode, invoiceId, router]
  );

  return (
    <form className="space-y-6" onSubmit={(e) => e.preventDefault()} noValidate>

      {/* ── Seller ────────────────────────────────────────────────────── */}
      <Section title="Sprzedawca" icon={Building2}>
        <Grid2>
          <Field label="Nazwa firmy" required error={errors.seller_name?.message}>
            <Input {...register('seller_name')} placeholder="RiskGuard Sp. z o.o." readOnly className="bg-slate-50 dark:bg-slate-800/60" />
          </Field>
          <Field label="NIP" required error={errors.seller_nip?.message}>
            <Input {...register('seller_nip')} placeholder="1234567890" readOnly className="bg-slate-50 dark:bg-slate-800/60 font-mono" />
          </Field>
          <Field label="Adres" required error={errors.seller_address?.message} className="sm:col-span-2">
            <Input {...register('seller_address')} placeholder="ul. Prosta 12, 00-850 Warszawa" readOnly className="bg-slate-50 dark:bg-slate-800/60" />
          </Field>
          <Field label="Numer konta bankowego" error={errors.seller_bank_account?.message}>
            <Input {...register('seller_bank_account')} placeholder="PL00 0000 0000 0000 0000 0000 0000" className="font-mono" />
          </Field>
        </Grid2>
        <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" />
          Dane sprzedawcy są pobierane z ustawień firmy. Zmień je w Ustawieniach.
        </p>
      </Section>

      {/* ── Buyer ─────────────────────────────────────────────────────── */}
      <Section title="Nabywca" icon={User}>
        <Grid2>
          <Field label="Nazwa / Imię i nazwisko" required error={errors.buyer_name?.message}>
            <Input {...register('buyer_name')} placeholder="Firma ABC Sp. z o.o." />
          </Field>
          <Field label="NIP nabywcy" error={errors.buyer_nip?.message}>
            <Input {...register('buyer_nip')} placeholder="1234567890" className="font-mono" />
          </Field>
          <Field label="Adres nabywcy" error={errors.buyer_address?.message} className="sm:col-span-2">
            <Input {...register('buyer_address')} placeholder="ul. Przykładowa 1, 00-001 Warszawa" />
          </Field>
          <Field label="E-mail nabywcy" error={errors.buyer_email?.message}>
            <Input {...register('buyer_email')} type="email" placeholder="kontakt@firma.pl" />
          </Field>
        </Grid2>
      </Section>

      {/* ── Dates & payment ───────────────────────────────────────────── */}
      <Section title="Daty i płatność" icon={Calendar}>
        <Grid2>
          <Field label="Data wystawienia" required error={errors.issue_date?.message}>
            <Input {...register('issue_date')} type="date" />
          </Field>
          <Field label="Data sprzedaży" error={errors.sale_date?.message}>
            <Input {...register('sale_date')} type="date" />
          </Field>
          <Field label="Termin płatności" error={errors.due_date?.message}>
            <Input {...register('due_date')} type="date" />
          </Field>
          <Field label="Forma płatności" required error={errors.payment_method?.message}>
            <Select
              defaultValue="transfer"
              onValueChange={(v) => setValue('payment_method', v as LocalFormValues['payment_method'])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Grid2>
      </Section>

      {/* ── Line items ────────────────────────────────────────────────── */}
      <Section title="Pozycje faktury" icon={Hash}>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                {['Lp.', 'Nazwa / opis', 'Jedn.', 'Ilość', 'Cena netto', 'Stawka VAT', 'Rabat %', 'Netto', 'VAT', 'Brutto', ''].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50/50 dark:bg-slate-800/30 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((field, i) => {
                const c = computedItems[i] ?? { net_amount: 0, vat_amount: 0, gross_amount: 0 };
                return (
                  <tr
                    key={field.id}
                    className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 group"
                  >
                    <td className="px-3 py-2 text-slate-400 text-xs w-8">{i + 1}</td>
                    <td className="px-2 py-2 min-w-[200px]">
                      <Input
                        {...register(`items.${i}.name`)}
                        placeholder="Nazwa usługi / towaru"
                        className={cn('h-8 text-sm', errors.items?.[i]?.name && 'border-red-400')}
                      />
                    </td>
                    <td className="px-2 py-2 w-20">
                      <Input
                        {...register(`items.${i}.unit`)}
                        placeholder="szt."
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="px-2 py-2 w-24">
                      <Input
                        {...register(`items.${i}.quantity`)}
                        type="number"
                        min="0.0001"
                        step="0.01"
                        placeholder="1"
                        className={cn('h-8 text-sm text-right', errors.items?.[i]?.quantity && 'border-red-400')}
                      />
                    </td>
                    <td className="px-2 py-2 w-28">
                      <Input
                        {...register(`items.${i}.unit_price_net`)}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className={cn('h-8 text-sm text-right', errors.items?.[i]?.unit_price_net && 'border-red-400')}
                      />
                    </td>
                    <td className="px-2 py-2 w-24">
                      <Select
                        defaultValue={field.vat_rate ?? '23'}
                        onValueChange={(v) => setValue(`items.${i}.vat_rate`, v as VatRate)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VAT_RATES.map((r) => (
                            <SelectItem key={r} value={r}>{VAT_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2 w-20">
                      <Input
                        {...register(`items.${i}.discount_pct`)}
                        type="number"
                        min="0"
                        max="99.99"
                        step="0.01"
                        placeholder="0"
                        className="h-8 text-sm text-right"
                      />
                    </td>
                    {/* Computed read-only cells */}
                    <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300 tabular-nums text-xs whitespace-nowrap w-28">
                      {fmt2(c.net_amount)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-500 tabular-nums text-xs whitespace-nowrap w-24">
                      {fmt2(c.vat_amount)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-200 tabular-nums text-xs whitespace-nowrap w-28">
                      {fmt2(c.gross_amount)}
                    </td>
                    <td className="px-2 py-2 w-8">
                      <button
                        type="button"
                        onClick={() => fields.length > 1 && remove(i)}
                        disabled={fields.length <= 1}
                        className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 disabled:pointer-events-none disabled:opacity-20"
                        aria-label="Usuń pozycję"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals footer */}
            <tfoot className="border-t-2 border-slate-200 dark:border-slate-700">
              <tr>
                <td colSpan={7} className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">
                  Razem
                </td>
                <td className="px-3 py-3 text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums text-right whitespace-nowrap">
                  {fmt2(totals.net_total)} PLN
                </td>
                <td className="px-3 py-3 text-sm font-semibold text-slate-500 tabular-nums text-right whitespace-nowrap">
                  {fmt2(totals.vat_total)} PLN
                </td>
                <td colSpan={2} className="px-3 py-3 text-base font-bold text-slate-900 dark:text-white tabular-nums text-right whitespace-nowrap">
                  {fmt2(totals.gross_total)} PLN
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(emptyItem())}
          className="mt-4 gap-1.5 border-dashed"
        >
          <Plus className="w-4 h-4" />
          Dodaj pozycję
        </Button>

        {errors.items?.root?.message && (
          <p className="text-xs text-red-500 mt-1">{errors.items.root.message}</p>
        )}
      </Section>

      {/* ── Notes ─────────────────────────────────────────────────────── */}
      <Section title="Uwagi" icon={CreditCard}>
        <Field label="Uwagi / stopka faktury" error={errors.notes?.message}>
          <textarea
            {...register('notes')}
            rows={3}
            placeholder="Opcjonalne uwagi widoczne na fakturze…"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-colors"
          />
        </Field>
      </Section>

      {/* ── Action bar ────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 px-0 py-4">
        <div className="flex items-center gap-3">
          {/* Summary */}
          <div className="hidden sm:flex items-center gap-1 text-sm text-slate-500">
            <span>Brutto:</span>
            <span className="font-bold text-slate-900 dark:text-white tabular-nums">
              {fmt2(totals.gross_total)} PLN
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => { setIntent('draft'); onSubmit('draft'); }}
            className="gap-2"
          >
            {isPending && intent === 'draft' ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Zapisz szkic
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={() => { setIntent('issue'); onSubmit('issue'); }}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20"
          >
            {isPending && intent === 'issue' ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Wystaw fakturę
          </Button>
        </div>
      </div>
    </form>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
        <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyItem() {
  return {
    name:           '',
    unit:           'szt.',
    quantity:       1,
    unit_price_net: 0,
    vat_rate:       '23' as VatRate,
    discount_pct:   undefined,
  };
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function fmt2(n: number) {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// Tiny helper to track which intent button was last pressed (for spinner state)
function useTransitionState<T>(initial: T): [T, (v: T) => void] {
  const ref = { current: initial };
  const set = (v: T) => { ref.current = v; };
  return [ref.current, set];
}
