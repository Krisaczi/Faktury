'use client';

import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Loader as Loader2, TriangleAlert as AlertTriangle, Check, Clock, TrendingUp, TrendingDown, ArrowRight, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import type { CompanyUser } from '@/lib/auth/role-actions';

interface PlanInfo {
  id:          string;
  name:        string;
  description: string;
  monthlyPrice: number;
  limits: {
    vendors_limit:     number | null;
    reports_per_month: number | null;
    users_limit:       number | null;
    file_uploads:      boolean;
    invoicing:         boolean;
  };
  active: boolean;
}

interface SubscriptionData {
  currentPlan: {
    id:           string;
    name:         string;
    description:  string;
    monthlyPrice: number;
    limits:       PlanInfo['limits'] | null;
  };
  usage: {
    activeUsers:      number;
    vendorCount:      number;
    reportsThisMonth: number;
  };
  conflicts: Array<{ field: string; label: string; current: number; limit: number | null; over: boolean }>;
}

interface Props {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  user:          CompanyUser;
  onSuccess:     () => void;
}

type Step = 'loading' | 'detail' | 'confirm' | 'success' | 'error';

export function ManagePlanModal({ open, onOpenChange, user, onSuccess }: Props) {
  const [step, setStep]               = useState<Step>('loading');
  const [plans, setPlans]             = useState<PlanInfo[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [effective, setEffective]     = useState<'now' | 'period_end'>('now');
  const [reason, setReason]           = useState('');
  const [notes, setNotes]             = useState('');
  const [notifyUser, setNotifyUser]   = useState(true);
  const [forceDowngrade, setForceDowngrade] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [conflicts, setConflicts]     = useState<Array<{ field: string; label: string; current: number; limit: number | null; over: boolean }>>([]);
  const [result, setResult]           = useState<{ fromPlan: string; toPlan: string; effective: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setStep('loading');
    setError(null);

    try {
      const [plansRes, subRes] = await Promise.all([
        fetch('/api/admin/plans'),
        fetch(`/api/admin/users/${user.id}/subscription`),
      ]);

      const plansData = await plansRes.json() as { plans: PlanInfo[] };
      const subData   = await subRes.json() as SubscriptionData;

      setPlans(plansData.plans ?? []);
      setSubscription(subData);
      setSelectedPlanId(subData.currentPlan.id);
      setStep('detail');
    } catch {
      setError('Błąd ładowania danych.');
      setStep('error');
    }
  }, [user.id]);

  useEffect(() => {
    if (open) {
      setStep('loading');
      setError(null);
      setResult(null);
      setConflicts([]);
      setForceDowngrade(false);
      fetchData();
    }
  }, [open, fetchData]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const isDowngrade = subscription && selectedPlan
    ? plans.findIndex((p) => p.id === selectedPlanId) < plans.findIndex((p) => p.id === subscription.currentPlan.id)
    : false;

  const priceDiff = selectedPlan && subscription
    ? selectedPlan.monthlyPrice - subscription.currentPlan.monthlyPrice
    : 0;

  const handleSubmit = async () => {
    if (!selectedPlan) return;
    setIsSubmitting(true);
    setError(null);
    setConflicts([]);

    try {
      const res = await fetch(`/api/admin/users/${user.id}/change-plan`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          planId:         selectedPlanId,
          effective,
          reason:         reason || undefined,
          notes:          notes || undefined,
          notifyUser,
          forceDowngrade,
        }),
      });

      const data = await res.json();

      if (res.status === 422 && data.conflicts) {
        setConflicts(data.conflicts);
        setError(data.error);
        setIsSubmitting(false);
        return;
      }

      if (!res.ok) {
        setError(data.error ?? 'Błąd zmiany planu.');
        setIsSubmitting(false);
        return;
      }

      setResult({ fromPlan: data.fromPlan, toPlan: data.toPlan, effective: data.effective });
      setStep('success');
      setIsSubmitting(false);
    } catch {
      setError('Błąd połączenia z serwerem.');
      setStep('error');
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (step === 'success') onSuccess();
    onOpenChange(false);
  };

  const formatPrice = (cents: number) =>
    cents === 0 ? 'Bezpłatny' : `${(cents / 100).toFixed(2)} zł / mies.`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-600" />
            Zarządzaj planem
          </DialogTitle>
          <DialogDescription>
            Zmień plan subskrypcji dla: <strong>{user.full_name ?? user.email}</strong>
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
            <Button variant="outline" size="sm" className="mt-4" onClick={fetchData}>
              Spróbuj ponownie
            </Button>
          </div>
        )}

        {/* Detail / selection step */}
        {step === 'detail' && subscription && (
          <div className="space-y-5">
            {/* Current plan card */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Obecny plan</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {subscription.currentPlan.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{formatPrice(subscription.currentPlan.monthlyPrice)}</p>
                </div>
                <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400">
                  Aktywny
                </Badge>
              </div>

              {/* Usage stats */}
              <Separator className="my-3" />
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Użytkownicy</p>
                  <p className="font-medium text-slate-700 dark:text-slate-300">
                    {subscription.usage.activeUsers}
                    {subscription.currentPlan.limits && (
                      <span className="text-slate-400">
                        {' '}/ {subscription.currentPlan.limits.users_limit ?? '∞'}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Dostawcy</p>
                  <p className="font-medium text-slate-700 dark:text-slate-300">{subscription.usage.vendorCount}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Raporty (mies.)</p>
                  <p className="font-medium text-slate-700 dark:text-slate-300">{subscription.usage.reportsThisMonth}</p>
                </div>
              </div>

              {/* Existing conflicts on current plan */}
              {subscription.conflicts.length > 0 && (
                <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Obecne użycie przekracza limity: {subscription.conflicts.map((c) => c.label).join(', ')}
                  </p>
                </div>
              )}
            </div>

            {/* Plan selection */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                Wybierz nowy plan
              </p>
              {plans.map((plan) => {
                const isSelected = plan.id === selectedPlanId;
                const isCurrent = plan.id === subscription.currentPlan.id;
                const downgrade = plans.findIndex((p) => p.id === plan.id) < plans.findIndex((p) => p.id === subscription.currentPlan.id);

                return (
                  <button
                    key={plan.id}
                    onClick={() => { setSelectedPlanId(plan.id); setConflicts([]); setForceDowngrade(false); }}
                    disabled={isCurrent}
                    className={cn(
                      'w-full text-left rounded-lg border p-3.5 transition-all',
                      isSelected
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600',
                      isCurrent && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {downgrade ? (
                          <TrendingDown className="w-4 h-4 text-amber-500" />
                        ) : (
                          <TrendingUp className="w-4 h-4 text-emerald-500" />
                        )}
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{plan.name}</span>
                        {isCurrent && <Badge variant="outline" className="text-[10px]">Obecny</Badge>}
                      </div>
                      <span className="text-xs text-slate-500">{formatPrice(plan.monthlyPrice)}</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{plan.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
                      <span>Użytkownicy: {plan.limits.users_limit ?? '∞'}</span>
                      <span>Dostawcy: {plan.limits.vendors_limit ?? '∞'}</span>
                      <span>Raporty: {plan.limits.reports_per_month ?? '∞'}</span>
                      {plan.limits.invoicing && <span>Fakturowanie</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Effective timing */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                Kiedy zastosować
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setEffective('now')}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-all',
                    effective === 'now'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Natychmiast</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Zmień plan teraz</p>
                </button>
                <button
                  onClick={() => setEffective('period_end')}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-all',
                    effective === 'period_end'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Koniec okresu</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Zaplanuj na koniec okresu</p>
                </button>
              </div>
            </div>

            {/* Proration preview */}
            {selectedPlan && selectedPlan.id !== subscription.currentPlan.id && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3.5 space-y-2">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                  Podgląd rozliczenia
                </p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Różnica ceny</span>
                  <span className={cn('font-medium', priceDiff > 0 ? 'text-emerald-600' : priceDiff < 0 ? 'text-amber-600' : 'text-slate-500')}>
                    {priceDiff > 0 ? '+' : ''}{(priceDiff / 100).toFixed(2)} zł / mies.
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Data wejścia w życie</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {effective === 'now' ? 'Natychmiast' : 'Koniec okresu rozliczeniowego'}
                  </span>
                </div>
                {isDowngrade && effective === 'now' && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Downgrade może ograniczyć dostęp do funkcji. Sprawdź, czy obecne użycie mieści się w limitach nowego planu.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Usage conflicts from server */}
            {conflicts.length > 0 && (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3.5 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    Użycie przekracza limity nowego planu
                  </p>
                </div>
                <ul className="space-y-1">
                  {conflicts.map((c) => (
                    <li key={c.field} className="text-xs text-red-600 dark:text-red-400">
                      {c.label}: {c.current} (limit: {c.limit ?? '∞'})
                    </li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceDowngrade}
                    onChange={(e) => setForceDowngrade(e.target.checked)}
                    className="rounded border-red-300"
                  />
                  <span className="text-xs text-red-700 dark:text-red-400 font-medium">
                    Wymuś downgrade mimo przekroczenia limitów
                  </span>
                </label>
              </div>
            )}

            {/* Reason + notes */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Powód (opcjonalnie)</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="np. prośba klienta"
                  className="text-sm h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Notatki wewnętrzne</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="notatka dla administracji"
                  className="text-sm h-9"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyUser}
                onChange={(e) => setNotifyUser(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span className="text-sm text-slate-600 dark:text-slate-400">Powiadom użytkownika o zmianie</span>
            </label>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>
        )}

        {/* Success step */}
        {step === 'success' && result && (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {result.effective === 'now' ? 'Plan zmieniony pomyślnie' : 'Zmiana planu zaplanowana'}
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <span className="font-mono">{result.fromPlan}</span>
              <ArrowRight className="w-4 h-4" />
              <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{result.toPlan}</span>
            </div>
            {result.effective === 'period_end' && (
              <p className="text-xs text-slate-400">Zmiana wejdzie w życie na koniec bieżącego okresu rozliczeniowego.</p>
            )}
          </div>
        )}

        <DialogFooter className={step === 'success' ? 'sm:justify-center' : ''}>
          {step === 'success' ? (
            <Button onClick={handleClose} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
              <Check className="w-4 h-4" />
              Zamknij
            </Button>
          ) : step === 'detail' ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Anuluj
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !selectedPlanId || selectedPlanId === subscription?.currentPlan.id}
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Zastosuj zmianę
              </Button>
            </>
          ) : step === 'error' ? (
            <Button variant="outline" onClick={handleClose}>Zamknij</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
