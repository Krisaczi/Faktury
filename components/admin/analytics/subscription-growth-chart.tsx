'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const MONTHS = ['Lis', 'Gru', 'Sty', 'Lut', 'Mar', 'Kwi'];
const DATA = [
  { month: 'Lis', active: 8, trial: 14, expired: 2 },
  { month: 'Gru', active: 13, trial: 17, expired: 3 },
  { month: 'Sty', active: 19, trial: 21, expired: 4 },
  { month: 'Lut', active: 27, trial: 18, expired: 5 },
  { month: 'Mar', active: 34, trial: 22, expired: 6 },
  { month: 'Kwi', active: 41, trial: 19, expired: 7 },
];

export function SubscriptionGrowthChart() {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Wzrost subskrypcji</CardTitle>
        <CardDescription>Aktywne, próbne i wygasłe konta — ostatnie 6 miesięcy</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={DATA} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorTrial" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(38 92% 50%)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="hsl(38 92% 50%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorExpired" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(0 84% 60%)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(0 84% 60%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(v) =>
                v === 'active' ? 'Aktywne' : v === 'trial' ? 'Próbne' : 'Wygasłe'
              }
              wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }}
            />
            <Area type="monotone" dataKey="active" stroke="hsl(142 71% 45%)" strokeWidth={2} fill="url(#colorActive)" />
            <Area type="monotone" dataKey="trial" stroke="hsl(38 92% 50%)" strokeWidth={2} fill="url(#colorTrial)" />
            <Area type="monotone" dataKey="expired" stroke="hsl(0 84% 60%)" strokeWidth={2} fill="url(#colorExpired)" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
