'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Building2, ShieldAlert, RefreshCw, CircleCheck as CheckCircle2, Circle as XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { syncInvoices } from '@/lib/actions/sync-invoices';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { mutate } from 'swr';
import { useAuth } from '@/providers/auth-provider';
import { useT } from '@/providers/i18n-provider';

type SyncState = 'idle' | 'loading' | 'success' | 'error';

export function QuickActions() {
  const { user } = useAuth();
  const { data } = useDashboardStats();
  const t = useT();
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncMessage, setSyncMessage] = useState('');

  const links = [
    {
      label: t.nav.invoices,
      href: '/invoices',
      icon: FileText,
      description: t.dashboard.viewInvoices,
      color: 'text-blue-600',
      bg: 'bg-blue-50 hover:bg-blue-100',
    },
    {
      label: t.nav.vendors,
      href: '/vendors',
      icon: Building2,
      description: t.dashboard.manageVendors,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 hover:bg-emerald-100',
    },
    {
      label: t.nav.riskReport,
      href: '/risk-report',
      icon: ShieldAlert,
      description: t.dashboard.reviewRisk,
      color: 'text-amber-600',
      bg: 'bg-amber-50 hover:bg-amber-100',
    },
  ];

  const handleSync = async () => {
    const companyId = data?.companyId;
    if (!companyId) {
      setSyncMessage(t.dashboard.syncNoCompany);
      setSyncState('error');
      setTimeout(() => setSyncState('idle'), 3500);
      return;
    }

    setSyncState('loading');
    setSyncMessage('');

    try {
      const summary = await syncInvoices(companyId);
      setSyncMessage(t.dashboard.syncResult(summary.total, summary.newInvoices, summary.updatedInvoices, summary.errors.length));
      setSyncState('success');
      if (user?.id) {
        await mutate(`dashboard-stats-${user.id}`);
      }
      setTimeout(() => setSyncState('idle'), 5000);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : t.dashboard.syncFailed);
      setSyncState('error');
      setTimeout(() => setSyncState('idle'), 5000);
    }
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{t.dashboard.quickActions}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1">
        <>
          <Button
            onClick={handleSync}
            disabled={syncState === 'loading'}
            className={cn(
              'w-full gap-2 font-semibold transition-all duration-200',
              syncState === 'success' && 'bg-emerald-600 hover:bg-emerald-700',
              syncState === 'error' && 'bg-rose-600 hover:bg-rose-700'
            )}
            size="lg"
          >
            {syncState === 'loading' && <RefreshCw className="h-4 w-4 animate-spin" />}
            {syncState === 'success' && <CheckCircle2 className="h-4 w-4" />}
            {syncState === 'error' && <XCircle className="h-4 w-4" />}
            {syncState === 'idle' && <RefreshCw className="h-4 w-4" />}
            {syncState === 'loading'
              ? t.dashboard.syncing
              : syncState === 'success'
              ? t.dashboard.syncComplete
              : syncState === 'error'
              ? t.dashboard.syncFailed
              : t.dashboard.syncNow}
          </Button>

          {syncMessage && syncState !== 'loading' && (
            <p
              className={cn(
                'text-xs leading-relaxed rounded-md px-3 py-2',
                syncState === 'success' && 'bg-emerald-50 text-emerald-700',
                syncState === 'error' && 'bg-rose-50 text-rose-700'
              )}
            >
              {syncMessage}
            </p>
          )}
        </>

        <div className="grid grid-cols-1 gap-2 mt-1">
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.label} href={item.href}>
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors cursor-pointer',
                    item.bg
                  )}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', item.color)} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{item.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
