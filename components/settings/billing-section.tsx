'use client';

import { useState, useEffect, useCallback } from 'react';
import { CreditCard, CircleCheck as CheckCircle2, Clock, Circle as XCircle, ExternalLink, Zap, ShieldCheck, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useT } from '@/providers/i18n-provider';

type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'paused' | null;

interface BillingData {
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string | null;
  lsSubscriptionId: string | null;
  companyId: string | null;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function BillingSection() {
  const { user } = useAuth();
  const t = useT();
  const supabase = createClient();

  const STATUS_CONFIG: Record<NonNullable<SubscriptionStatus>, {
    label: string;
    icon: React.ElementType;
    badgeClass: string;
    description: string;
  }> = {
    active: {
      label: t.billing.statusLabels.active,
      icon: CheckCircle2,
      badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      description: t.billing.statusDescriptions.active,
    },
    trialing: {
      label: t.billing.statusLabels.trialing,
      icon: Clock,
      badgeClass: 'bg-blue-100 text-blue-700 border-blue-200',
      description: t.billing.statusDescriptions.trialing,
    },
    past_due: {
      label: t.billing.statusLabels.past_due,
      icon: XCircle,
      badgeClass: 'bg-rose-100 text-rose-700 border-rose-200',
      description: t.billing.statusDescriptions.past_due,
    },
    cancelled: {
      label: t.billing.statusLabels.cancelled,
      icon: XCircle,
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      description: t.billing.statusDescriptions.cancelled,
    },
    paused: {
      label: t.billing.statusLabels.paused,
      icon: Clock,
      badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
      description: t.billing.statusDescriptions.paused,
    },
  };

  const PLAN_FEATURES = [
    { label: t.billing.features.unlimitedSyncs, icon: Zap },
    { label: t.billing.features.riskAnalysis, icon: ShieldCheck },
    { label: t.billing.features.vendorTracking, icon: Star },
    { label: t.billing.features.invoiceHistory, icon: CreditCard },
  ];

  const [billing, setBilling] = useState<BillingData>({
    subscriptionStatus: null,
    subscriptionEndsAt: null,
    lsSubscriptionId: null,
    companyId: null,
  });
  const [loading, setLoading] = useState(true);

  const loadBilling = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: userRow } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRow?.company_id) {
      setLoading(false);
      return;
    }

    const { data: company } = await supabase
      .from('companies')
      .select('subscription_status, subscription_ends_at, ls_subscription_id')
      .eq('id', userRow.company_id)
      .maybeSingle();

    setBilling({
      subscriptionStatus: ((company as any)?.subscription_status as SubscriptionStatus) ?? 'trialing',
      subscriptionEndsAt: (company as any)?.subscription_ends_at ?? null,
      lsSubscriptionId: (company as any)?.ls_subscription_id ?? null,
      companyId: userRow.company_id,
    });
    setLoading(false);
  }, [user]);

  useEffect(() => { loadBilling(); }, [loadBilling]);

  const status = billing.subscriptionStatus ?? 'trialing';
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['trialing'];
  const StatusIcon = statusCfg.icon;

  const LEMON_SQUEEZY_CHECKOUT_URL = process.env.NEXT_PUBLIC_LS_CHECKOUT_URL ?? '#';

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-600" />
              <CardTitle className="text-base">{t.billing.title}</CardTitle>
            </div>
            {!loading && (
              <Badge variant="outline" className={cn('gap-1.5', statusCfg.badgeClass)}>
                <StatusIcon className="h-3 w-3" />
                {statusCfg.label}
              </Badge>
            )}
          </div>
          <CardDescription>
            {loading ? t.billing.loading : statusCfg.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!loading && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">{t.billing.currentPlan}</p>
                  <p className="text-sm font-semibold">{t.billing.planName}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    {status === 'cancelled' ? t.billing.accessUntil : status === 'trialing' ? t.billing.trialEnds : t.billing.renewsOn}
                  </p>
                  <p className="text-sm font-semibold">
                    {billing.subscriptionEndsAt ? formatDate(billing.subscriptionEndsAt) : t.billing.noRenewalDate}
                  </p>
                </div>
              </div>

              {billing.lsSubscriptionId && (
                <div className="text-xs text-muted-foreground">
                  {t.billing.subscriptionId}{' '}
                  <span className="font-mono">{billing.lsSubscriptionId}</span>
                </div>
              )}

              <Separator />

              <div className="flex flex-wrap gap-3">
                {(status === 'trialing' || status === 'cancelled') && (
                  <Button
                    asChild
                    className="gap-2 bg-blue-600 hover:bg-blue-700"
                  >
                    <a href={LEMON_SQUEEZY_CHECKOUT_URL} target="_blank" rel="noopener noreferrer">
                      <Zap className="h-4 w-4" />
                      {status === 'cancelled' ? t.billing.resubscribe : t.billing.upgradeNow}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}

                {status === 'past_due' && (
                  <Button variant="destructive" asChild className="gap-2">
                    <a href={LEMON_SQUEEZY_CHECKOUT_URL} target="_blank" rel="noopener noreferrer">
                      <CreditCard className="h-4 w-4" />
                      {t.billing.updatePayment}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}

                {(status === 'active' || status === 'paused') && (
                  <Button variant="outline" asChild className="gap-2">
                    <a href={LEMON_SQUEEZY_CHECKOUT_URL} target="_blank" rel="noopener noreferrer">
                      <CreditCard className="h-4 w-4" />
                      {t.billing.manageSubscription}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {(status === 'trialing' || status === 'cancelled') && (
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-slate-50">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-600" />
              <CardTitle className="text-base">{t.billing.professionalPlan}</CardTitle>
            </div>
            <CardDescription>
              {t.billing.professionalPlanDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PLAN_FEATURES.map(({ label, icon: Icon }) => (
                <div key={label} className="flex items-center gap-2 text-sm">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100">
                    <Icon className="h-3 w-3 text-blue-600" />
                  </div>
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <Separator />

            <div className="flex items-end justify-between">
              <div>
                <span className="text-3xl font-bold tracking-tight">149</span>
                <span className="text-lg font-semibold"> PLN</span>
                <span className="text-sm text-muted-foreground">{'/miesiąc'}</span>
              </div>
              <Button asChild className="gap-2 bg-blue-600 hover:bg-blue-700">
                <a href={LEMON_SQUEEZY_CHECKOUT_URL} target="_blank" rel="noopener noreferrer">
                  {t.billing.getStarted}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              {t.billing.secureCheckout}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
