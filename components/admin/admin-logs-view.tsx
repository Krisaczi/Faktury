'use client';

import { RefreshCw, UserPlus, CreditCard, TriangleAlert as AlertTriangle, LogIn, Shield, Building2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type LogLevel = 'info' | 'warning' | 'error' | 'success';

type LogEntry = {
  id: number;
  timestamp: string;
  level: LogLevel;
  icon: React.ElementType;
  message: string;
  detail: string;
};

const PLACEHOLDER_LOGS: LogEntry[] = [
  { id: 1, timestamp: '2026-04-15 14:32:11', level: 'info', icon: UserPlus, message: 'Nowy użytkownik zarejestrowany', detail: 'jan.kowalski@firma.pl (ID: usr_3kxp9)' },
  { id: 2, timestamp: '2026-04-15 14:18:44', level: 'success', icon: CreditCard, message: 'Subskrypcja aktywowana', detail: 'Acme Sp. z o.o. — plan Professional (ls_sub_99xz)' },
  { id: 3, timestamp: '2026-04-15 13:55:02', level: 'info', icon: RefreshCw, message: 'Synchronizacja KSeF ukończona', detail: '843 faktur — 0 błędów (firma: cmp_7abc)' },
  { id: 4, timestamp: '2026-04-15 13:41:19', level: 'warning', icon: AlertTriangle, message: 'Faktura wysokiego ryzyka wykryta', detail: 'Faktura #FV/2026/0451 — duplikat (firma: cmp_7abc)' },
  { id: 5, timestamp: '2026-04-15 12:30:07', level: 'info', icon: LogIn, message: 'Logowanie użytkownika', detail: 'anna.nowak@example.com (IP: 85.221.x.x)' },
  { id: 6, timestamp: '2026-04-15 11:14:58', level: 'info', icon: Building2, message: 'Nowa firma skonfigurowana', detail: 'Beta Partners Sp. z o.o. — NIP: 7272727272' },
  { id: 7, timestamp: '2026-04-15 10:02:31', level: 'error', icon: AlertTriangle, message: 'Błąd synchronizacji KSeF', detail: 'Token wygasł — firma: cmp_3xyz (HTTP 401)' },
  { id: 8, timestamp: '2026-04-15 09:47:15', level: 'success', icon: Shield, message: 'Użytkownik awansowany do roli admin', detail: 'admin@ksefapp.pl — przez: system' },
  { id: 9, timestamp: '2026-04-14 22:00:00', level: 'info', icon: RefreshCw, message: 'Tygodniowy e-mail z podsumowaniem wysłany', detail: '12 użytkowników — 0 błędów dostarczenia' },
  { id: 10, timestamp: '2026-04-14 18:33:44', level: 'warning', icon: CreditCard, message: 'Subskrypcja wygasa wkrótce', detail: 'Gamma Logistics Sp. z o.o. — 2 dni pozostały' },
  { id: 11, timestamp: '2026-04-14 15:20:10', level: 'error', icon: Trash2, message: 'Subskrypcja anulowana', detail: 'Delta Corp. — anulowanie przez użytkownika' },
  { id: 12, timestamp: '2026-04-14 09:01:00', level: 'info', icon: RefreshCw, message: 'Synchronizacja KSeF uruchomiona automatycznie', detail: '1 204 faktur — 3 błędy (firma: cmp_12mn)' },
];

const LEVEL_CONFIG: Record<LogLevel, { label: string; badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline'; dotClass: string }> = {
  info: { label: 'Info', badgeVariant: 'secondary', dotClass: 'bg-sky-400' },
  success: { label: 'OK', badgeVariant: 'default', dotClass: 'bg-green-500' },
  warning: { label: 'Uwaga', badgeVariant: 'outline', dotClass: 'bg-amber-400' },
  error: { label: 'Błąd', badgeVariant: 'destructive', dotClass: 'bg-red-500' },
};

export function AdminLogsView() {
  return (
    <div className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Logi systemowe</h1>
        <p className="text-sm text-muted-foreground mt-1">Historia zdarzeń w systemie (dane przykładowe)</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Dziennik zdarzeń</CardTitle>
          <CardDescription>Ostatnie zdarzenia zarejestrowane przez system</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border font-mono text-xs">
            {PLACEHOLDER_LOGS.map((entry) => {
              const Icon = entry.icon;
              const level = LEVEL_CONFIG[entry.level];
              return (
                <li key={entry.id} className="flex items-start gap-4 px-6 py-3.5 hover:bg-muted/40 transition-colors">
                  <span className="shrink-0 text-muted-foreground tabular-nums mt-0.5 w-36">{entry.timestamp}</span>
                  <Badge variant={level.badgeVariant} className="shrink-0 text-[10px] h-5 mt-0.5">
                    {level.label}
                  </Badge>
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                    <div className="min-w-0">
                      <span className="font-semibold not-italic text-foreground">{entry.message}</span>
                      <span className="text-muted-foreground ml-2">{entry.detail}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
