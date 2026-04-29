'use client';

import { ListTodo, Timer, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const LOAD_METRICS = [
  {
    label: 'KSeF — kolejka synchronizacji',
    value: '3',
    unit: 'zadania oczekujące',
    icon: ListTodo,
    iconBg: 'bg-sky-50 dark:bg-sky-950',
    iconColor: 'text-sky-600',
    note: 'Następna synch. za ~4 min',
  },
  {
    label: 'Średni czas synchronizacji',
    value: '1 min 42 s',
    unit: 'na firmę',
    icon: Timer,
    iconBg: 'bg-violet-50 dark:bg-violet-950',
    iconColor: 'text-violet-600',
    note: 'Pomiar z ostatnich 24 godz.',
  },
  {
    label: 'Wywołania API (ostatnia godz.)',
    value: '2 841',
    unit: 'zapytań / godz.',
    icon: Zap,
    iconBg: 'bg-amber-50 dark:bg-amber-950',
    iconColor: 'text-amber-600',
    note: 'Limit: 10 000 / godz.',
  },
];

export function SystemLoadCards() {
  return (
    <div>
      <div className="mb-3">
        <h2 className="text-sm font-semibold">Obciążenie systemu</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Statyczne dane testowe</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {LOAD_METRICS.map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.label}>
              <CardContent className="p-5">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${m.iconBg} mb-4`}>
                  <Icon className={`h-5 w-5 ${m.iconColor}`} />
                </div>
                <p className="text-2xl font-bold tracking-tight">{m.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.unit}</p>
                <p className="text-[11px] text-muted-foreground/70 mt-2 border-t border-border pt-2">{m.note}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
