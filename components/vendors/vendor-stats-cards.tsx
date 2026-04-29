'use client';

import { FileText, TrendingUp, ShieldAlert, CircleDollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VendorProfile } from '@/hooks/use-vendor-profile';

interface Props {
  stats: VendorProfile['stats'];
  currency: string;
}

const formatCurrency = (amount: number, currency: string) =>
  new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: currency || 'PLN',
    maximumFractionDigits: 0,
  }).format(amount);

interface CardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  iconClass: string;
  bgClass: string;
}

function StatCard({ label, value, sub, icon: Icon, iconClass, bgClass }: CardProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', bgClass)}>
        <Icon className={cn('h-4.5 w-4.5', iconClass)} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-xl font-bold leading-none tracking-tight">{value}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

export function VendorStatsCards({ stats, currency }: Props) {
  const riskPct =
    stats.totalInvoices > 0
      ? Math.round((stats.highRiskCount / stats.totalInvoices) * 100)
      : 0;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard
        label="Total Invoices"
        value={String(stats.totalInvoices)}
        sub="all time"
        icon={FileText}
        iconClass="text-blue-600"
        bgClass="bg-blue-50"
      />
      <StatCard
        label="Avg Invoice"
        value={formatCurrency(stats.avgAmount, currency)}
        sub="per invoice"
        icon={CircleDollarSign}
        iconClass="text-emerald-600"
        bgClass="bg-emerald-50"
      />
      <StatCard
        label="High Risk"
        value={String(stats.highRiskCount)}
        sub={`${riskPct}% of invoices`}
        icon={ShieldAlert}
        iconClass="text-rose-600"
        bgClass="bg-rose-50"
      />
      <StatCard
        label="Risk Level"
        value={stats.overallRisk.charAt(0).toUpperCase() + stats.overallRisk.slice(1)}
        sub="overall vendor risk"
        icon={TrendingUp}
        iconClass={
          stats.overallRisk === 'high'
            ? 'text-rose-600'
            : stats.overallRisk === 'medium'
            ? 'text-amber-600'
            : 'text-emerald-600'
        }
        bgClass={
          stats.overallRisk === 'high'
            ? 'bg-rose-50'
            : stats.overallRisk === 'medium'
            ? 'bg-amber-50'
            : 'bg-emerald-50'
        }
      />
    </div>
  );
}
