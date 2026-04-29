'use client';

import { FileText, ShieldAlert, PiggyBank, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useT } from '@/providers/i18n-provider';

function StatSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-3 w-40" />
      </CardContent>
    </Card>
  );
}

export function StatsCards() {
  const { data, isLoading } = useDashboardStats();
  const t = useT();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)}
      </div>
    );
  }

  const total = data?.totalInvoices ?? 0;
  const highRisk = data?.highRiskCount ?? 0;
  const saved = data?.estimatedSaved ?? 0;
  const riskRate = total > 0 ? Math.round((highRisk / total) * 100) : 0;

  const stats = [
    {
      title: t.dashboard.statsInvoicesSynced,
      value: total.toLocaleString('pl-PL'),
      sub: t.dashboard.statsInvoicesSub,
      icon: FileText,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-50',
      valueColor: '',
    },
    {
      title: t.dashboard.statsHighRisk,
      value: highRisk.toLocaleString('pl-PL'),
      sub: highRisk === 0 ? t.dashboard.statsHighRiskNone : t.dashboard.statsHighRiskRate(riskRate),
      icon: ShieldAlert,
      iconColor: highRisk > 0 ? 'text-rose-600' : 'text-emerald-600',
      iconBg: highRisk > 0 ? 'bg-rose-50' : 'bg-emerald-50',
      valueColor: highRisk > 0 ? 'text-rose-600' : '',
    },
    {
      title: t.dashboard.statsPlnSaved,
      value: `PLN\u00a0${saved.toLocaleString('pl-PL')}`,
      sub: t.dashboard.statsPlnSavedSub,
      icon: PiggyBank,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-50',
      valueColor: 'text-emerald-700',
    },
    {
      title: t.dashboard.statsAvgRisk,
      value: `${riskRate}%`,
      sub: total === 0 ? t.dashboard.statsAvgRiskNone : t.dashboard.statsAvgRiskCount(total),
      icon: TrendingUp,
      iconColor: riskRate > 20 ? 'text-amber-600' : 'text-slate-500',
      iconBg: riskRate > 20 ? 'bg-amber-50' : 'bg-slate-50',
      valueColor: riskRate > 20 ? 'text-amber-700' : '',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card
            key={stat.title}
            className="transition-shadow duration-200 hover:shadow-md"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', stat.iconBg)}>
                <Icon className={cn('h-4 w-4', stat.iconColor)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={cn('text-2xl font-bold tracking-tight', stat.valueColor)}>
                {stat.value}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
