'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import {
  Shield, Building2, Package, CircleCheck as CheckCircle2,
  ArrowRight, ArrowLeft, Loader as Loader2, Zap, Star, Clock,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { createCompany, finalizeProduct, getOnboardingState } from './actions';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const companySchema = z.object({
  companyName: z.string().min(2, 'Nazwa musi mieć co najmniej 2 znaki'),
  nip:         z.string().regex(/^\d{10}$/, 'NIP musi mieć dokładnie 10 cyfr'),
  street:      z.string().min(3, 'Podaj ulicę i numer'),
  zip:         z.string().regex(/^\d{2}-\d{3}$/, 'Format kodu: XX-XXX'),
  city:        z.string().min(2, 'Podaj miejscowość'),
  currency:    z.enum(['PLN', 'EUR', 'USD', 'GBP']),
});

type CompanyData = z.infer<typeof companySchema>;

type ProductType  = 'starter' | 'professional';
type TrialChoice  = 'trial' | 'immediate';

const CURRENCIES = [
  { value: 'PLN', label: 'PLN – Złoty polski' },
  { value: 'EUR', label: 'EUR – Euro' },
  { value: 'USD', label: 'USD – Dolar amerykański' },
  { value: 'GBP', label: 'GBP – Funt brytyjski' },
] as const;

const PRODUCTS: {
  type:     ProductType;
  name:     string;
  price:    string;
  icon:     React.ElementType;
  color:    'blue' | 'amber';
  features: string[];
}[] = [
  {
    type:     'starter',
    name:     'Starter',
    price:    'Bezpłatny',
    icon:     Zap,
    color:    'blue',
    features: ['1 użytkownik', '25 dostawców', '10 raportów / miesiąc', 'Import faktur XML', 'Analiza ryzyka'],
  },
  {
    type:     'professional',
    name:     'Professional',
    price:    'Płatny',
    icon:     Star,
    color:    'amber',
    features: ['Do 3 użytkowników', 'Nieograniczeni dostawcy', 'Nieograniczone raporty', 'Import faktur XML', 'Analiza ryzyka', 'Wystawianie faktur (KSeF)'],
  },
];

// ─── Step bar ─────────────────────────────────────────────────────────────────

function StepBar({ step }: { step: 1 | 2 | 3 }) {
  const labels = ['Dane firmy', 'Produkt', 'Podsumowanie'];
  return (
    <div className="flex items-center gap-1 mb-8">
      {labels.map((label, i) => {
        const idx     = i + 1;
        const done    = step > idx;
        const current = step === idx;
        return (
          <div key={label} className={cn('flex items-center', i < labels.length - 1 && 'flex-1')}>
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                done    && 'bg-emerald-500 text-white',
                current && 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900/40',
                !done && !current && 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
              )}>
                {done ? <CheckCircle2 className="w-4 h-4" /> : idx}
              </div>
              <span className={cn(
                'text-[10px] font-medium whitespace-nowrap',
                current ? 'text-blue-600' : 'text-slate-400',
              )}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div className={cn(
                'flex-1 h-px mx-2 mt-[-10px]',
                step > idx ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700',
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared form helpers ──────────────────────────────────────────────────────

function inputCls(hasError: boolean) {
  return cn(
    'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700',
    hasError && 'border-red-400 focus-visible:ring-red-400',
  );
}

function Field({
  label, hint, error, children,
}: {
  label: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</Label>
      {children}
      {error  && <p className="text-xs text-red-500">{error}</p>}
      {!error && hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// ─── Step 1: Company data ─────────────────────────────────────────────────────

function StepCompany({
  onNext,
  serverError,
  isSubmitting,
}: {
  onNext:       (data: CompanyData) => void;
  serverError:  string | null;
  isSubmitting: boolean;
}) {
  const {
    register, handleSubmit, setValue, watch,
    formState: { errors },
  } = useForm<CompanyData>({
    resolver:      zodResolver(companySchema),
    defaultValues: { currency: 'PLN' },
  });

  const currency = watch('currency');

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-4 h-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Dane firmy
        </h2>
      </div>

      <Field label="Nazwa firmy *" error={errors.companyName?.message}>
        <Input
          placeholder="Acme Sp. z o.o."
          {...register('companyName')}
          className={inputCls(!!errors.companyName)}
        />
      </Field>

      <Field label="NIP *" hint="10-cyfrowy numer identyfikacji podatkowej" error={errors.nip?.message}>
        <Input
          placeholder="1234567890"
          maxLength={10}
          {...register('nip')}
          className={cn(inputCls(!!errors.nip), 'font-mono tracking-wider')}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 pt-1">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Adres rejestrowy</div>
        <Field label="Ulica i numer *" error={errors.street?.message}>
          <Input
            placeholder="ul. Główna 1"
            {...register('street')}
            className={inputCls(!!errors.street)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kod pocztowy *" error={errors.zip?.message}>
            <Input
              placeholder="00-000"
              maxLength={6}
              {...register('zip')}
              className={inputCls(!!errors.zip)}
            />
          </Field>
          <Field label="Miejscowość *" error={errors.city?.message}>
            <Input
              placeholder="Warszawa"
              {...register('city')}
              className={inputCls(!!errors.city)}
            />
          </Field>
        </div>
      </div>

      <Field label="Waluta">
        <Select
          value={currency}
          onValueChange={(v) => setValue('currency', v as CompanyData['currency'])}
        >
          <SelectTrigger className={inputCls(false)}><SelectValue /></SelectTrigger>
          <SelectContent>
            {CURRENCIES.map(({ value, label }) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {serverError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
          <p className="text-sm text-red-600 dark:text-red-400">{serverError}</p>
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 mt-2"
      >
        {isSubmitting
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Zapisywanie…</>
          : <>Dalej <ArrowRight className="w-4 h-4 ml-2" /></>}
      </Button>
    </form>
  );
}

// ─── Step 2: Product selection ────────────────────────────────────────────────

function StepProduct({
  defaultProduct,
  onNext,
  onBack,
  serverError,
  isSubmitting,
}: {
  defaultProduct: ProductType;
  onNext:         (product: ProductType, trial: TrialChoice) => void;
  onBack:         () => void;
  serverError:    string | null;
  isSubmitting:   boolean;
}) {
  const [product, setProduct] = useState<ProductType>(defaultProduct);
  const [trial,   setTrial]   = useState<TrialChoice>('trial');

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Package className="w-4 h-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Wybierz produkt
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PRODUCTS.map((p) => {
          const Icon    = p.icon;
          const checked = product === p.type;
          return (
            <button
              key={p.type}
              type="button"
              onClick={() => setProduct(p.type)}
              className={cn(
                'text-left rounded-xl border-2 p-4 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                checked
                  ? p.color === 'amber'
                    ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-900/10'
                    : 'border-blue-500 bg-blue-50/60 dark:bg-blue-900/10'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600',
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center',
                  p.color === 'amber'
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
                )}>
                  <Icon className="w-[18px] h-[18px]" />
                </div>
                {checked && (
                  <CheckCircle2 className={cn(
                    'w-5 h-5',
                    p.color === 'amber' ? 'text-amber-500' : 'text-blue-500',
                  )} />
                )}
              </div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">{p.name}</p>
              <p className={cn(
                'text-xs font-medium mt-0.5',
                p.color === 'amber'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-blue-600 dark:text-blue-400',
              )}>
                {p.price}
              </p>
              <ul className="mt-3 space-y-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Rozpoczęcie</p>
        {([
          { value: 'trial' as const, icon: Clock, title: '7-dniowy okres próbny', desc: 'Przetestuj wszystkie funkcje bez żadnych zobowiązań.' },
          { value: 'immediate' as const, icon: Zap, title: 'Zacznij od razu', desc: 'Aktywuj plan natychmiast.' },
        ]).map(({ value, icon: Icon, title, desc }) => (
          <label
            key={value}
            className={cn(
              'flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all',
              trial === value
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300',
            )}
          >
            <input
              type="radio"
              name="trial"
              value={value}
              checked={trial === value}
              onChange={() => setTrial(value)}
              className="sr-only"
            />
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
              <Icon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{title}</p>
              <p className="text-xs text-slate-400">{desc}</p>
            </div>
            {trial === value && <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" />}
          </label>
        ))}
      </div>

      {serverError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
          <p className="text-sm text-red-600 dark:text-red-400">{serverError}</p>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Wstecz
        </Button>
        <Button
          type="button"
          disabled={isSubmitting}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-10"
          onClick={() => onNext(product, trial)}
        >
          {isSubmitting
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Zapisywanie…</>
            : <>Dalej <ArrowRight className="w-4 h-4 ml-2" /></>}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Confirm ──────────────────────────────────────────────────────────

interface ConfirmData {
  company:     CompanyData;
  product:     ProductType;
  trial:       TrialChoice;
  serverError: string | null;
  isSubmitting: boolean;
  onBack:      () => void;
  onSubmit:    () => void;
}

function StepConfirm({ company, product, trial, serverError, isSubmitting, onBack, onSubmit }: ConfirmData) {
  const productInfo = PRODUCTS.find((p) => p.type === product)!;
  const trialLabel  = trial === 'trial' ? '7-dniowy okres próbny' : 'Aktywacja natychmiastowa';

  const rows: [string, string][] = [
    ['Firma',       company.companyName],
    ['NIP',         company.nip],
    ['Adres',       `${company.street}, ${company.zip} ${company.city}`],
    ['Waluta',      company.currency],
    ['Plan',        productInfo.name],
    ['Rozpoczęcie', trialLabel],
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Podsumowanie
        </h2>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
        {rows.map(([key, val]) => (
          <div key={key} className="flex justify-between px-4 py-3 text-sm">
            <span className="text-slate-500 dark:text-slate-400">{key}</span>
            <span className="font-medium text-slate-900 dark:text-white text-right max-w-[55%] truncate">{val}</span>
          </div>
        ))}
      </div>

      {trial === 'trial' && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-4 py-3 flex items-start gap-3">
          <Clock className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Twój 7-dniowy okres próbny rozpocznie się dzisiaj. Po jego zakończeniu możesz wybrać plan lub kontynuować korzystanie z bezpłatnej wersji.
          </p>
        </div>
      )}

      <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-4 py-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Klikając „Utwórz konto", akceptujesz{' '}
          <Link href="/terms-of-use" className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">
            Warunki korzystania
          </Link>{' '}oraz{' '}
          <Link href="/privacy-policy" className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">
            Politykę prywatności
          </Link>.
        </p>
      </div>

      {serverError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
          <p className="text-sm text-red-600 dark:text-red-400">{serverError}</p>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Wstecz
        </Button>
        <Button
          type="button"
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-10"
          onClick={onSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Tworzenie konta…</>
            : <>Utwórz konto <ArrowRight className="w-4 h-4 ml-2" /></>}
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [checking,    setChecking]    = useState(true);
  const [step,        setStep]        = useState<1 | 2 | 3>(1);
  const [company,     setCompany]     = useState<CompanyData | null>(null);
  const [companyId,   setCompanyId]   = useState<string | null>(null);
  const [product,     setProduct]     = useState<ProductType>('starter');
  const [trial,       setTrial]       = useState<TrialChoice>('trial');
  const [error,       setError]       = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  const supabase = getSupabaseBrowserClient();

  // On mount: check session, detect onboarding state, and route to correct step
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/login'; return; }

      const state = await getOnboardingState();

      if (!state.ok) {
        setChecking(false);
        return;
      }

      if (state.data.step === 'product_selected') {
        // Already fully onboarded
        window.location.href = '/dashboard';
        return;
      }

      if (state.data.step === 'company_created' && state.data.companyId) {
        // Resume at step 2
        setCompanyId(state.data.companyId);
        if (state.data.productType) setProduct(state.data.productType);
        setStep(2);
      }

      setChecking(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 1 submit — persists company to DB before advancing
  async function handleCompanySubmit(data: CompanyData) {
    setError(null);
    setSubmitting(true);

    const result = await createCompany({
      companyName: data.companyName,
      nip:         data.nip,
      street:      data.street,
      zip:         data.zip,
      city:        data.city,
      currency:    data.currency,
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setCompany(data);
    setCompanyId(result.data.companyId);
    setStep(2);
  }

  // Step 2 submit — saves product selection, then show summary
  function handleProductSubmit(p: ProductType, t: TrialChoice) {
    setProduct(p);
    setTrial(t);
    setStep(3);
  }

  // Step 3 final submit — finalizes product and redirects
  async function handleFinalSubmit() {
    if (!companyId) return;
    setError(null);
    setSubmitting(true);

    const result = await finalizeProduct({
      companyId,
      productType: product,
      trialActive: trial === 'trial',
    });

    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    await supabase.auth.refreshSession();
    window.location.href = '/dashboard';
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 shadow-lg shadow-blue-600/25 mb-4">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Skonfiguruj swoje konto
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Kilka kroków i będziesz gotowy do pracy.
          </p>
          {step === 2 && companyId && (
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              Firma zapisana — możesz kontynuować w dowolnym momencie.
            </p>
          )}
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8">
          <StepBar step={step} />

          {step === 1 && (
            <StepCompany
              onNext={handleCompanySubmit}
              serverError={error}
              isSubmitting={submitting}
            />
          )}
          {step === 2 && (
            <StepProduct
              defaultProduct={product}
              onNext={handleProductSubmit}
              onBack={() => setStep(1)}
              serverError={error}
              isSubmitting={submitting}
            />
          )}
          {step === 3 && company && (
            <StepConfirm
              company={company}
              product={product}
              trial={trial}
              serverError={error}
              isSubmitting={submitting}
              onBack={() => setStep(2)}
              onSubmit={handleFinalSubmit}
            />
          )}
          {/* Resumed at step 2 without local company data — show condensed confirm */}
          {step === 3 && !company && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Podsumowanie
                </h2>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                {([
                  ['Plan',        PRODUCTS.find((p) => p.type === product)?.name ?? product],
                  ['Rozpoczęcie', trial === 'trial' ? '7-dniowy okres próbny' : 'Aktywacja natychmiastowa'],
                ] as [string, string][]).map(([key, val]) => (
                  <div key={key} className="flex justify-between px-4 py-3 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{key}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{val}</span>
                  </div>
                ))}
              </div>
              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setStep(2)} disabled={submitting} className="gap-2">
                  <ArrowLeft className="w-4 h-4" /> Wstecz
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-10"
                  onClick={handleFinalSubmit}
                  disabled={submitting}
                >
                  {submitting
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Tworzenie konta…</>
                    : <>Utwórz konto <ArrowRight className="w-4 h-4 ml-2" /></>}
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          Kontynuując, wyrażasz zgodę na{' '}
          <Link href="/terms-of-use" className="text-blue-500 hover:text-blue-600 hover:underline transition-colors">
            Warunki korzystania
          </Link>{' '}i{' '}
          <Link href="/privacy-policy" className="text-blue-500 hover:text-blue-600 hover:underline transition-colors">
            Politykę prywatności
          </Link>.
        </p>
      </div>
    </div>
  );
}
