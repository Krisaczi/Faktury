import { FileText, ShieldAlert, PiggyBank, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { pl as t } from '@/lib/i18n/pl';

interface DemoStatsCardsProps {
  totalInvoices: number;
  highRisk: number;
  plnSaved: number;
}

export function DemoStatsCards({ totalInvoices, highRisk, plnSaved }: DemoStatsCardsProps) {
  const riskRate = totalInvoices > 0 ? Math.round((highRisk / totalInvoices) * 100) : 0;

  const stats = [
    {
      title: t.dashboard.statsInvoicesSynced,
      value: totalInvoices.toLocaleString('pl-PL'),
      sub: t.dashboard.statsInvoicesSub,
      icon: FileText,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-50',
      valueColor: '',
    },
    {
      title: t.dashboard.statsHighRisk,
      value: highRisk.toLocaleString('pl-PL'),
      sub: t.dashboard.statsHighRiskRate(riskRate),
      icon: ShieldAlert,
      iconColor: 'text-rose-600',
      iconBg: 'bg-rose-50',
      valueColor: 'text-rose-600',
    },
    {
      title: t.dashboard.statsPlnSaved,
      value: `PLN ${plnSaved.toLocaleString('pl-PL')}`,
      sub: t.dashboard.statsPlnSavedSub,
      icon: PiggyBank,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-50',
      valueColor: 'text-emerald-700',
    },
    {
      title: t.dashboard.statsAvgRisk,
      value: `${riskRate}%`,
      sub: t.dashboard.statsAvgRiskCount(totalInvoices),
      icon: TrendingUp,
      iconColor: riskRate > 10 ? 'text-amber-600' : 'text-slate-500',
      iconBg: riskRate > 10 ? 'bg-amber-50' : 'bg-slate-50',
      valueColor: riskRate > 10 ? 'text-amber-700' : '',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title} className="transition-shadow duration-200 hover:shadow-md">
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
