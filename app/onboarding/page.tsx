'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
    .regex(/^\d{10}$/, 'NIP must be exactly 10 digits'),
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

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

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
        nip: data.nip,
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

    const { error: userError } = await supabase
      .from('users')
      .update({ company_id: company.id, role: 'owner' })
      .eq('id', user.id);

    if (userError) {
      setServerError(userError.message ?? 'Failed to update user record. Please try again.');
      return;
    }

    router.push('/dashboard');
    router.refresh();
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
            Set up your company
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Tell us about your organization to get started with RiskGuard.
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
              Company Details
            </h2>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Company Name */}
            <div className="space-y-1.5">
              <Label htmlFor="companyName" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Company Name
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
                NIP (Tax ID)
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
                <p className="text-xs text-slate-400">10-digit Polish tax identification number</p>
              )}
            </div>

            {/* Currency */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Default Currency
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
                  Setting up…
                </>
              ) : (
                <>
                  Continue to Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          You can update these details later in Settings.
        </p>
      </div>
    </div>
  );
}
