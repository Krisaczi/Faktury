'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Globe, Hash, Check, ChevronRight, Loader as Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import { useT } from '@/providers/i18n-provider';
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

const CURRENCY_VALUES = ['PLN', 'EUR', 'USD', 'GBP'] as const;

interface FormData {
  companyName: string;
  nip: string;
  currency: string;
}

function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const id = i + 1;
        return (
          <div key={id} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all',
                current > id
                  ? 'bg-blue-600 text-white'
                  : current === id
                  ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                  : 'bg-slate-200 text-slate-500'
              )}
            >
              {current > id ? <Check className="h-3.5 w-3.5" /> : id}
            </div>
            <span
              className={cn(
                'text-xs font-medium',
                current >= id ? 'text-slate-800' : 'text-slate-400'
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 mx-1" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function NipInput({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  hint: string;
}) {
  const formatted = value.replace(/\D/g, '').slice(0, 10);
  const isValid = formatted.length === 10;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="nip">NIP</Label>
      <div className="relative">
        <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="nip"
          placeholder="1234567890"
          className="pl-9 pr-9 font-mono tracking-widest"
          value={formatted}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
          maxLength={10}
        />
        {isValid && (
          <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />
        )}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function OnboardingForm() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormData>({
    companyName: '',
    nip: '',
    currency: 'PLN',
  });

  const updateField = (field: keyof FormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const canProceed =
    form.companyName.trim().length >= 2 &&
    form.nip.replace(/\D/g, '').length === 10 &&
    form.currency.length > 0;

  const handleSubmit = async () => {
    if (!user || !canProceed) return;
    setSubmitting(true);
    setError('');

    try {
      // Ensure the session is fresh before making authenticated requests
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError || !session) {
        throw new Error('Your session has expired. Please log in again.');
      }

      const now = new Date();
      const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: form.companyName.trim(),
          nip: form.nip.replace(/\D/g, ''),
          currency: form.currency,
          trial_start: now.toISOString(),
          trial_end: trialEnd.toISOString(),
          is_trial_active: true,
          subscription_status: 'trialing',
        })
        .select('id')
        .single();

      if (companyError || !company) {
        throw new Error(companyError?.message ?? 'Failed to create company');
      }

      const { error: userError } = await supabase
        .from('users')
        .upsert({
          id: user.id,
          email: user.email ?? '',
          company_id: company.id,
          role: 'owner',
          onboarded: true,
        });

      if (userError) {
        throw new Error(userError.message);
      }

      router.push('/settings/ksef');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.onboarding.errorGeneric);
      setSubmitting(false);
    }
  };

  const STEPS = [t.onboarding.stepCompanyDetails, t.onboarding.stepConfirm];

  const confirmRows = [
    { label: t.onboarding.companyNameField, value: form.companyName },
    { label: t.onboarding.nipField, value: form.nip },
    { label: t.onboarding.currencyField, value: form.currency },
  ];

  return (
    <div className="w-full max-w-md">
      <div className="mb-8">
        <StepIndicator current={step} steps={STEPS} />
      </div>

      <div className="rounded-2xl border border-border bg-white p-8 shadow-sm">
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {t.onboarding.tellUs}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t.onboarding.tellUsSubtitle}
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyName">{t.onboarding.companyName}</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="companyName"
                    placeholder={t.onboarding.companyNamePlaceholder}
                    className="pl-9"
                    value={form.companyName}
                    onChange={(e) => updateField('companyName', e.target.value)}
                  />
                </div>
              </div>

              <NipInput
                value={form.nip}
                onChange={(v) => updateField('nip', v)}
                hint={t.onboarding.nipHint}
              />

              <div className="space-y-1.5">
                <Label>{t.onboarding.currency}</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground z-10 pointer-events-none" />
                  <Select
                    value={form.currency}
                    onValueChange={(v) => updateField('currency', v)}
                  >
                    <SelectTrigger className="pl-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_VALUES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {t.onboarding.currencies[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Button
              className="w-full bg-blue-600 hover:bg-blue-700"
              onClick={() => setStep(2)}
              disabled={!canProceed}
            >
              {t.common.continue}
              <ChevronRight className="ml-1.5 h-4 w-4" />
            </Button>

            {error && (
              <p className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {t.onboarding.confirmTitle}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t.onboarding.confirmSubtitle}
              </p>
            </div>

            <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
              {confirmRows.map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between bg-slate-50/60 px-4 py-3"
                >
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {label}
                  </span>
                  <span className="text-sm font-semibold text-slate-800 font-mono">
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {error && (
              <p className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                disabled={submitting}
                className="flex-1"
              >
                {t.common.back}
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.onboarding.creating}
                  </>
                ) : (
                  t.onboarding.createWorkspace
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
