'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Loader as Loader2, Building2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { BuyerCompanySchema } from '@/app/(admin)/admin/companies/types';
import type { BuyerCompanyFormValues, BuyerCompany } from '@/app/(admin)/admin/companies/types';
import { createBuyerCompany, updateBuyerCompany } from '@/app/(admin)/admin/companies/actions';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  mode:       'create' | 'edit';
  defaultValues?: Partial<BuyerCompanyFormValues>;
  companyId?: string;
  onSuccess:  (company: BuyerCompany) => void;
  onCancel:   () => void;
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({
  label, error, children, hint,
}: {
  label: string; error?: string; children: React.ReactNode; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider pt-2 pb-1 border-b border-slate-100 dark:border-slate-800">
      {children}
    </h3>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CompanyForm({ mode, defaultValues, companyId, onSuccess, onCancel }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition]  = useTransition();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<BuyerCompanyFormValues>({
    resolver: zodResolver(BuyerCompanySchema),
    defaultValues: {
      name:                        '',
      nip:                         '',
      vat_payer:                   true,
      country:                     'Polska',
      default_payment_terms_days:  14,
      default_payment_method:      'transfer',
      ...defaultValues,
    },
  });

  const vatPayer = watch('vat_payer');

  const onSubmit = (values: BuyerCompanyFormValues) => {
    setServerError(null);
    startTransition(async () => {
      const result = mode === 'create'
        ? await createBuyerCompany(values)
        : await updateBuyerCompany(companyId!, values);

      if (result.ok) {
        onSuccess(result.data);
      } else {
        setServerError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

      {/* Basic info */}
      <SectionTitle>Dane podstawowe</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nazwa *" error={errors.name?.message}>
          <Input
            {...register('name')}
            placeholder="Firma ABC sp. z o.o."
            className={cn(errors.name && 'border-red-400')}
            aria-invalid={!!errors.name}
          />
        </Field>

        <Field
          label="NIP"
          error={errors.nip?.message}
          hint="10 cyfr bez separatorów"
        >
          <Input
            {...register('nip')}
            placeholder="0000000000"
            maxLength={10}
            className={cn(errors.nip && 'border-red-400')}
          />
        </Field>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Podatnik VAT</p>
          <p className="text-xs text-slate-400">Kontrahent rozlicza się jako płatnik VAT</p>
        </div>
        <Switch
          checked={vatPayer}
          onCheckedChange={(v) => setValue('vat_payer', v)}
          aria-label="Podatnik VAT"
        />
      </div>

      {/* Address */}
      <SectionTitle>Adres</SectionTitle>
      <Field label="Ulica i numer" error={errors.street?.message}>
        <Input {...register('street')} placeholder="ul. Przykładowa 1/2" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Kod pocztowy" error={errors.postal_code?.message}>
          <Input {...register('postal_code')} placeholder="00-001" />
        </Field>
        <Field label="Miasto" error={errors.city?.message}>
          <Input {...register('city')} placeholder="Warszawa" />
        </Field>
      </div>
      <Field label="Kraj" error={errors.country?.message}>
        <Input {...register('country')} defaultValue="Polska" />
      </Field>

      {/* Contact */}
      <SectionTitle>Kontakt</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="E-mail" error={errors.email?.message}>
          <Input {...register('email')} type="email" placeholder="kontakt@firma.pl" />
        </Field>
        <Field label="Telefon" error={errors.phone?.message}>
          <Input {...register('phone')} placeholder="+48 000 000 000" />
        </Field>
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors w-fit"
        aria-expanded={showAdvanced}
      >
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showAdvanced && 'rotate-180')} />
        {showAdvanced ? 'Ukryj ustawienia płatności' : 'Pokaż ustawienia płatności'}
      </button>

      {showAdvanced && (
        <>
          <SectionTitle>Płatności</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Termin płatności (dni)" error={errors.default_payment_terms_days?.message}>
              <Input
                {...register('default_payment_terms_days', { valueAsNumber: true })}
                type="number"
                min={0}
                max={365}
                placeholder="14"
              />
            </Field>
            <Field label="Domyślna metoda płatności" error={errors.default_payment_method?.message}>
              <Select
                defaultValue={defaultValues?.default_payment_method ?? 'transfer'}
                onValueChange={(v) => setValue('default_payment_method', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">Przelew</SelectItem>
                  <SelectItem value="cash">Gotówka</SelectItem>
                  <SelectItem value="card">Karta</SelectItem>
                  <SelectItem value="other">Inne</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="E-mail do faktur" error={errors.billing_email?.message}>
            <Input {...register('billing_email')} type="email" placeholder="faktury@firma.pl" />
          </Field>
          <Field label="Notatki" error={errors.notes?.message}>
            <textarea
              {...register('notes')}
              rows={3}
              placeholder="Wewnętrzne uwagi..."
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </Field>
        </>
      )}

      {serverError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400" role="alert">
          {serverError}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
          Anuluj
        </Button>
        <Button type="submit" disabled={isPending} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === 'create' ? 'Dodaj kontrahenta' : 'Zapisz zmiany'}
        </Button>
      </div>
    </form>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

interface ModalProps {
  mode:           'create' | 'edit';
  defaultValues?: Partial<BuyerCompanyFormValues>;
  companyId?:     string;
  onSuccess:      (company: BuyerCompany) => void;
  onClose:        () => void;
}

export function CompanyFormModal({ mode, defaultValues, companyId, onSuccess, onClose }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'create' ? 'Nowy kontrahent' : 'Edytuj kontrahenta'}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {mode === 'create' ? 'Nowy kontrahent' : 'Edytuj kontrahenta'}
              </h2>
              <p className="text-xs text-slate-400">
                {mode === 'create' ? 'Dodaj firmę do bazy kontrahentów' : 'Zaktualizuj dane kontrahenta'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Zamknij"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <CompanyForm
            mode={mode}
            defaultValues={defaultValues}
            companyId={companyId}
            onSuccess={onSuccess}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
