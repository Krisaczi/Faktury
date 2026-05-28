'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Shield, Building2, ArrowRight, Loader as Loader2 } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const onboardingSchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters'),
  nip: z
    .string()
    .regex(/^\d{10}$/, 'NIP must be exactly 10 digits')
    .or(z.literal('')),
  currency: z.enum(['PLN', 'EUR', 'USD', 'GBP']),
});

type OnboardingData = z.infer<typeof onboardingSchema>;

const CURRENCIES = [
  { value: 'PLN', label: 'PLN – Polish Zloty' },
  { value: 'EUR', label: 'EUR – Euro' },
  { value: 'USD', label: 'USD – US Dollar' },
  { value: 'GBP', label: 'GBP – British Pound' },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function OnboardingPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // If user already has a company, skip straight to dashboard
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        window.location.href = '/login';
        return;
      }
      const { data: userRecord } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle();

      if (userRecord?.company_id) {
        window.location.href = '/dashboard';
        return;
      }
      setChecking(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { currency: 'PLN' },
  });

  const currency = watch('currency');

  async function onSubmit(data: OnboardingData) {
    setServerError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setServerError('Session expired. Please sign in again.');
      return;
    }

    const ingestionEmail = `${slugify(data.companyName)}@invoiceguard.app`;

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        name: data.companyName,
        nip: data.nip || null,
        currency: data.currency,
        ingestion_email: ingestionEmail,
        subscription_status: 'trial',
      })
      .select('id')
      .single();

    if (companyError || !company) {
      setServerError(companyError?.message ?? 'Failed to create company. Please try again.');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: userError, count } = await (supabase as any)
      .from('users')
      .update({ company_id: company.id, role: 'owner' }, { count: 'exact' })
      .eq('id', user.id);

    if (userError) {
      setServerError(userError.message ?? 'Failed to update user record. Please try again.');
      return;
    }

    // If RLS blocked the update (0 rows affected), surface a clear error
    if (count === 0) {
      setServerError('Could not link your account to the company. Please try signing out and back in.');
      return;
    }

    // Refresh session so the server picks up the new company association,
    // then hard-navigate to bypass any stale RSC cache.
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
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 shadow-lg shadow-blue-600/25 mb-4">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Dodaj swoją firmę
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Wrpowadź dane firmy.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">
              1
            </div>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 text-xs font-bold">
              2
            </div>
          </div>

          <div className="flex items-center gap-2 mb-6">
            <Building2 className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
              Dane firmy
            </h2>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Company Name */}
            <div className="space-y-1.5">
              <Label htmlFor="companyName" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Nazwa
              </Label>
              <Input
                id="companyName"
                placeholder="Acme Sp. z o.o."
                className={cn(
                  'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700',
                  errors.companyName && 'border-red-400 focus-visible:ring-red-400'
                )}
                {...register('companyName')}
              />
              {errors.companyName && (
                <p className="text-xs text-red-500">{errors.companyName.message}</p>
              )}
            </div>

            {/* NIP */}
            <div className="space-y-1.5">
              <Label htmlFor="nip" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                NIP (Tax ID) <span className="text-slate-400 font-normal">— opcjonalnie</span>
              </Label>
              <Input
                id="nip"
                placeholder="1234567890"
                maxLength={10}
                className={cn(
                  'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 font-mono tracking-wider',
                  errors.nip && 'border-red-400 focus-visible:ring-red-400'
                )}
                {...register('nip')}
              />
              {errors.nip ? (
                <p className="text-xs text-red-500">{errors.nip.message}</p>
              ) : (
                <p className="text-xs text-slate-400">10-cyfrowy numer NIP</p>
              )}
            </div>

            {/* Currency */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Waluta
              </Label>
              <Select
                value={currency}
                onValueChange={(val) => setValue('currency', val as OnboardingData['currency'])}
              >
                <SelectTrigger
                  className={cn(
                    'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700',
                    errors.currency && 'border-red-400'
                  )}
                >
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.currency && (
                <p className="text-xs text-red-500">{errors.currency.message}</p>
              )}
            </div>

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
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Tworzenie…
                </>
              ) : (
                <>
                  Przejdź do Panelu głownego
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          Możesz później uaktualnić dane w Ustawieniach firmy.
        </p>
        <p className="text-center text-xs text-slate-400 mt-2">
          Kontynuując, wyrażasz zgodę na{' '}
          <Link href="/terms-of-use" className="text-blue-500 hover:text-blue-600 hover:underline transition-colors">
            Warunki korzystania
          </Link>
          {' '}i{' '}
          <Link href="/privacy-policy" className="text-blue-500 hover:text-blue-600 hover:underline transition-colors">
            Politykę prywatności
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

