'use client';

import { Database, Wifi, Mail, CircleCheck as CheckCircle2, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type ServiceStatus = {
  name: string;
  description: string;
  status: 'ok' | 'degraded' | 'down';
  latency: string;
  lastChecked: string;
  icon: React.ElementType;
};

const SERVICES: ServiceStatus[] = [
  {
    name: 'Supabase (baza danych)',
    description: 'Połączenie z instancją PostgreSQL',
    status: 'ok',
    latency: '14 ms',
    lastChecked: 'teraz',
    icon: Database,
  },
  {
    name: 'API KSeF',
    description: 'Ministerstwo Finansów — endpoint produkcyjny',
    status: 'ok',
    latency: '210 ms',
    lastChecked: '2 min temu',
    icon: Wifi,
  },
  {
    name: 'Serwis e-mail',
    description: 'Wysyłka e-maili tygodniowych i powiadomień',
    status: 'ok',
    latency: '—',
    lastChecked: '5 min temu',
    icon: Mail,
  },
];

const STATUS_CONFIG = {
  ok: {
    label: 'Działa',
    badgeVariant: 'default' as const,
    dotClass: 'bg-green-500',
    cardClass: 'border-green-200 dark:border-green-900',
    iconBg: 'bg-green-50 dark:bg-green-950',
    iconColor: 'text-green-600',
  },
  degraded: {
    label: 'Obniżona wydajność',
    badgeVariant: 'outline' as const,
    dotClass: 'bg-amber-400',
    cardClass: 'border-amber-200 dark:border-amber-900',
    iconBg: 'bg-amber-50 dark:bg-amber-950',
    iconColor: 'text-amber-600',
  },
  down: {
    label: 'Niedostępny',
    badgeVariant: 'destructive' as const,
    dotClass: 'bg-red-500',
    cardClass: 'border-red-200 dark:border-red-900',
    iconBg: 'bg-red-50 dark:bg-red-950',
    iconColor: 'text-red-600',
  },
};

export function AdminSystemView() {
  const allOk = SERVICES.every((s) => s.status === 'ok');

  return (
    <div className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Status systemu</h1>
        <p className="text-sm text-muted-foreground mt-1">Aktualny stan usług zewnętrznych (dane statyczne)</p>
      </div>

      <Card className={allOk ? 'border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20' : ''}>
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">Wszystkie systemy działają poprawnie</p>
            <p className="text-xs text-muted-foreground">Ostatnie sprawdzenie: teraz</p>
          </div>
          <Badge variant="default" className="ml-auto bg-green-600 hover:bg-green-600">
            Operacyjny
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {SERVICES.map((service) => {
          const cfg = STATUS_CONFIG[service.status];
          const Icon = service.icon;
          return (
            <Card key={service.name} className={cfg.cardClass}>
              <CardContent className="flex items-center gap-5 p-5">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${cfg.iconBg}`}>
                  <Icon className={`h-5 w-5 ${cfg.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{service.name}</span>
                    <Badge variant={cfg.badgeVariant} className="text-[10px] h-4.5">
                      {cfg.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{service.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{service.latency}</span>
                    <span>opóźnienie</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {service.lastChecked}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Informacje środowiska</CardTitle>
          <CardDescription>Konfiguracja wdrożenia</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          {[
            ['Wersja aplikacji', 'v0.1.0'],
            ['Środowisko', 'Production'],
            ['Region bazy danych', 'eu-central-1'],
            ['Next.js', '13.5.1'],
            ['Supabase SDK', '2.58.x'],
            ['Node.js', '20.x'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between rounded-md bg-muted/50 px-3 py-2">
              <span className="text-muted-foreground text-xs">{label}</span>
              <span className="font-mono text-xs font-medium">{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
