'use client';

import { useState, useTransition } from 'react';
import { Building2, Search, Ban, CircleCheck as CheckCircle2, Clock, Circle as XCircle, CirclePause as PauseCircle, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { deactivateCompanySubscription } from '@/lib/actions/admin-actions';

type CompanyRow = {
  id: string;
  name: string | null;
  nip: string | null;
  subscription_status: string | null;
  trial_end: string | null;
  created_at: string | null;
  is_demo: boolean | null;
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Aktywna', icon: CheckCircle2, variant: 'default' },
  trialing: { label: 'Próbna', icon: Clock, variant: 'secondary' },
  cancelled: { label: 'Anulowana', icon: XCircle, variant: 'destructive' },
  past_due: { label: 'Zaległa', icon: Ban, variant: 'destructive' },
  paused: { label: 'Wstrzymana', icon: PauseCircle, variant: 'outline' },
};

function SubscriptionBadge({ status }: { status: string | null }) {
  const cfg = STATUS_CONFIG[status ?? ''] ?? { label: status ?? '—', icon: Shield, variant: 'outline' as const };
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="flex items-center gap-1 w-fit">
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

function DeactivateButton({ companyId, status }: { companyId: string; status: string | null }) {
  const [isPending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState(status);

  if (localStatus === 'cancelled') {
    return <span className="text-xs text-muted-foreground">Anulowana</span>;
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await deactivateCompanySubscription(companyId);
          setLocalStatus('cancelled');
        });
      }}
    >
      <Ban className="mr-1.5 h-3.5 w-3.5" />
      {isPending ? 'Anulowanie...' : 'Dezaktywuj'}
    </Button>
  );
}

function formatDate(date: string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function AdminCompaniesView({ companies }: { companies: CompanyRow[] }) {
  const [search, setSearch] = useState('');
  const realCompanies = companies.filter((c) => !c.is_demo);
  const filtered = realCompanies.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.name?.toLowerCase().includes(q) || c.nip?.includes(q);
  });

  return (
    <div className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Firmy</h1>
        <p className="text-sm text-muted-foreground mt-1">{realCompanies.length} firm w systemie</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Lista firm</CardTitle>
              <CardDescription>Zarządzaj firmami i ich subskrypcjami</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj firmy lub NIP..."
                className="pl-9 h-8 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa firmy</TableHead>
                <TableHead>NIP</TableHead>
                <TableHead>Status subskrypcji</TableHead>
                <TableHead>Koniec próby</TableHead>
                <TableHead>Zarejestrowana</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                    <Building2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    <p>Brak firm</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name ?? '—'}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{c.nip ?? '—'}</TableCell>
                    <TableCell>
                      <SubscriptionBadge status={c.subscription_status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(c.trial_end)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(c.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <DeactivateButton companyId={c.id} status={c.subscription_status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
