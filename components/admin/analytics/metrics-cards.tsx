'use client';

import { FileText, TriangleAlert, TrendingUp, Banknote } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const METRICS = [
  {
    label: 'Przetworzonych faktur',
    value: '84 312',
    change: '+12% vs ub. mies.',
    positive: true,
    icon: FileText,
    iconBg: 'bg-blue-50 dark:bg-blue-950',
    iconColor: 'text-blue-600',
  },
  {
    label: 'Faktury wysokiego ryzyka',
    value: '1 247',
    change: '+3% vs ub. mies.',
    positive: false,
    icon: TriangleAlert,
    iconBg: 'bg-red-50 dark:bg-red-950',
    iconColor: 'text-red-600',
  },
  {
    label: 'Średni poziom ryzyka',
    value: '18.4',
    change: '–2.1 pkt vs ub. mies.',
    positive: true,
    icon: TrendingUp,
    iconBg: 'bg-amber-50 dark:bg-amber-950',
    iconColor: 'text-amber-600',
  },
  {
    label: 'Wartość oflagowanych faktur',
    value: '4 782 340 PLN',
    change: 'Suma flagowanych kwot',
    positive: null,
    icon: Banknote,
    iconBg: 'bg-emerald-50 dark:bg-emerald-950',
    iconColor: 'text-emerald-600',
  },
];

export function AdminAnalyticsMetrics() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {METRICS.map((m) => {
        const Icon = m.icon;
        return (
          <Card key={m.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${m.iconBg}`}>
                  <Icon className={`h-5 w-5 ${m.iconColor}`} />
                </div>
              </div>
              <p className="mt-4 text-2xl font-bold tracking-tight leading-none">{m.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{m.label}</p>
              {m.positive !== null ? (
                <p className={`mt-2 text-[11px] font-medium ${m.positive ? 'text-green-600' : 'text-red-500'}`}>
                  {m.change}
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">{m.change}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
