'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const TOP_VENDORS = [
  { name: 'Omega Trans Sp. z o.o.', count: 87 },
  { name: 'Delta Logistics S.A.', count: 74 },
  { name: 'Alfa Partners Sp. k.', count: 61 },
  { name: 'Beta Services Sp. z o.o.', count: 55 },
  { name: 'Gamma Tech Sp. z o.o.', count: 48 },
  { name: 'Sigma Consulting S.A.', count: 43 },
  { name: 'Theta Import Export', count: 37 },
  { name: 'Kappa Usługi Sp. z o.o.', count: 31 },
  { name: 'Lambda Corp. Sp. z o.o.', count: 25 },
  { name: 'Mu Handel Sp. k.', count: 19 },
];

const MAX = TOP_VENDORS[0].count;

const BAR_COLORS = [
  'bg-red-600',
  'bg-red-500',
  'bg-red-400',
  'bg-orange-500',
  'bg-orange-400',
  'bg-amber-500',
  'bg-amber-400',
  'bg-yellow-500',
  'bg-yellow-400',
  'bg-yellow-300',
];

export function HighRiskVendorsChart() {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Dostawcy wysokiego ryzyka</CardTitle>
        <CardDescription>Top 10 dostawców wg liczby oflagowanych faktur</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2.5">
          {TOP_VENDORS.map((vendor, i) => (
            <li key={vendor.name} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground tabular-nums w-4 shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium truncate pr-2">{vendor.name}</span>
                  <span className="text-xs font-semibold tabular-nums shrink-0">{vendor.count}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${BAR_COLORS[i]}`}
                    style={{ width: `${(vendor.count / MAX) * 100}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
