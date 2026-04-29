'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Building2, CircleAlert as AlertCircle, CreditCard } from 'lucide-react';
import { useVendorProfile } from '@/hooks/use-vendor-profile';
import { Header } from '@/components/layout/header';
import { VendorStatsCards } from '@/components/vendors/vendor-stats-cards';
import { VendorRiskTrendChart } from '@/components/vendors/vendor-risk-trend-chart';
import { VendorInvoicesTable } from '@/components/vendors/vendor-invoices-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const riskConfig: Record<string, { label: string; className: string }> = {
  high: { label: 'High Risk', className: 'bg-rose-100 text-rose-700 border-rose-200' },
  medium: { label: 'Medium Risk', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  low: { label: 'Low Risk', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-32" />
        <Separator />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export default function VendorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: vendor, isLoading, error } = useVendorProfile(id ?? null);

  const risk = riskConfig[vendor?.stats.overallRisk ?? 'low'] ?? riskConfig['low'];

  return (
    <div className="flex flex-col">
      <Header
        title="Vendor Profile"
        description={vendor ? vendor.name : 'Loading…'}
      />
      <div className="flex flex-col gap-6 p-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/vendors')}
          className="w-fit gap-2 text-muted-foreground hover:text-foreground -ml-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Vendors
        </Button>

        {isLoading ? (
          <LoadingSkeleton />
        ) : error || !vendor ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card py-20 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              {error ? 'Failed to load vendor. Please try again.' : 'Vendor not found.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => router.push('/vendors')}>
              Return to Vendors
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                  <Building2 className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold tracking-tight">{vendor.name}</h2>
                    <Badge variant="outline" className={cn('text-xs', risk.className)}>
                      {risk.label}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="font-mono">NIP: {vendor.nip || '—'}</span>
                    <span className="text-border">|</span>
                    <span>Added {new Date(vendor.created_at).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>

              {vendor.bank_accounts?.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Known Bank Accounts
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {vendor.bank_accounts.map((acc, i) => (
                        <span
                          key={i}
                          className="rounded-md border border-border bg-muted/40 px-2.5 py-1 font-mono text-xs text-foreground"
                        >
                          {acc}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />
              <VendorStatsCards stats={vendor.stats} currency="PLN" />
            </div>

            <VendorRiskTrendChart riskTrend={vendor.stats.riskTrend} />
            <VendorInvoicesTable invoices={vendor.invoices} currency="PLN" />
          </div>
        )}
      </div>
    </div>
  );
}
