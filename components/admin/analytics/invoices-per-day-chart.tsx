'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const generateDailyData = () => {
  const data = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
    data.push({
      date: label,
      invoices: Math.floor(1800 + Math.random() * 1400 + (i < 7 ? 400 : 0)),
    });
  }
  return data;
};

const DATA = generateDailyData();

export function InvoicesPerDayChart() {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Faktury przetwarzane dziennie</CardTitle>
        <CardDescription>Ostatnie 30 dni — wszystkie firmy</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={DATA} margin={{ top: 0, right: 8, left: -20, bottom: 0 }} barSize={8}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
              formatter={(value: number) => [value.toLocaleString('pl-PL'), 'Faktury']}
            />
            <Bar dataKey="invoices" fill="hsl(215 65% 50%)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
