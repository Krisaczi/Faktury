'use client';

import { Users, Building2, CircleCheck as CheckCircle2, Clock, UserPlus, RefreshCw, CreditCard, TriangleAlert as AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type UserRow = {
  id: string;
  email: string | null;
  role: string | null;
  created_at: string | null;
  is_demo: boolean | null;
};

type CompanyRow = {
  id: string;
  name: string | null;
  subscription_status: string | null;
  trial_end: string | null;
  is_demo: boolean | null;
  created_at: string | null;
};

const ACTIVITY_FEED = [
  { icon: UserPlus, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950', message: 'Nowy użytkownik zarejestrowany', detail: 'jan.kowalski@firma.pl', time: '2 min temu' },
  { icon: CreditCard, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950', message: 'Subskrypcja zaktualizowana', detail: 'Acme Sp. z o.o. — plan Professional', time: '14 min temu' },
  { icon: RefreshCw, color: 'text-sky-600', bg: 'bg-sky-50 dark:bg-sky-950', message: 'Synchronizacja KSeF uruchomiona', detail: '843 faktur pobranych', time: '1 godz. temu' },
  { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950', message: 'Wykryto fakturę wysokiego ryzyka', detail: 'Vendor XYZ — duplikat faktury', time: '3 godz. temu' },
  { icon: UserPlus, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950', message: 'Nowy użytkownik zarejestrowany', detail: 'anna.nowak@example.com', time: '5 godz. temu' },
  { icon: CreditCard, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950', message: 'Subskrypcja anulowana', detail: 'Beta Sp. z o.o.', time: 'wczoraj' },
  { icon: RefreshCw, color: 'text-sky-600', bg: 'bg-sky-50 dark:bg-sky-950', message: 'Synchronizacja KSeF uruchomiona', detail: '1 204 faktur pobranych', time: 'wczoraj' },
];

function StatCard({
  icon: Icon,
  color,
  bg,
  value,
  label,
}: {
  icon: React.ElementType;
  color: string;
  bg: string;
  value: number;
  label: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminOverview({ users, companies }: { users: UserRow[]; companies: CompanyRow[] }) {
  const realUsers = users.filter((u) => !u.is_demo);
  const realCompanies = companies.filter((c) => !c.is_demo);
  const activeCount = realCompanies.filter((c) => c.subscription_status === 'active').length;
  const trialCount = realCompanies.filter((c) => c.subscription_status === 'trialing').length;

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Przegląd</h1>
        <p className="text-sm text-muted-foreground mt-1">Podsumowanie aktywności systemu</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-950" value={realUsers.length} label="Użytkownicy" />
        <StatCard icon={Building2} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950" value={realCompanies.length} label="Firmy" />
        <StatCard icon={CheckCircle2} color="text-green-600" bg="bg-green-50 dark:bg-green-950" value={activeCount} label="Aktywne subskrypcje" />
        <StatCard icon={Clock} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-950" value={trialCount} label="Konta próbne" />
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Ostatnia aktywność</CardTitle>
          <CardDescription>Zdarzenia systemowe w czasie rzeczywistym</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {ACTIVITY_FEED.map((item, i) => {
              const Icon = item.icon;
              return (
                <li key={i} className="flex items-start gap-4 px-6 py-4">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.bg}`}>
                    <Icon className={`h-4 w-4 ${item.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{item.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.detail}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0 mt-0.5">{item.time}</span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
