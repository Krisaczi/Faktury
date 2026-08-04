'use client';

import Link from 'next/link';
import { Building2, Users, Receipt, Zap, Star, CircleCheck as CheckCircle2, Circle as XCircle, ChevronRight, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CompanyCardData } from '@/lib/packages/actions';

function maskNip(nip: string | null): string {
  if (!nip) return '—';
  if (nip.length < 4) return nip;
  return `••••••${nip.slice(-4)}`;
}

function ProductBadge({ type }: { type: 'starter' | 'professional' | null }) {
  if (type === 'professional') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
        <Star className="w-3 h-3" />
        Professional
      </span>
    );
  }
  if (type === 'starter') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
        <Zap className="w-3 h-3" />
        Starter
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
      <Package className="w-3 h-3" />
      Brak planu
    </span>
  );
}

function StatRow({
  icon: Icon, label, value, warn,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex items-center gap-2.5 text-slate-500 dark:text-slate-400">
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className={cn(
        'text-xs font-semibold',
        warn ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200',
      )}>
        {value}
      </span>
    </div>
  );
}

export interface CompanyCardProps {
  data:         CompanyCardData;
  isOwner?:     boolean;
  onManageProduct?: (companyId: string) => void;
  className?:   string;
}

export function CompanyCard({
  data,
  isOwner = false,
  onManageProduct,
  className,
}: CompanyCardProps) {
  const {
    company_id, company_name, nip,
    product_type,
    current_user_count, allowed_user_limit, invoicing_enabled, is_active,
  } = data;

  const usersAtLimit  = allowed_user_limit !== null && current_user_count >= allowed_user_limit;
  const usersDisplay  = allowed_user_limit !== null
    ? `${current_user_count} / ${allowed_user_limit}`
    : `${current_user_count} / ∞`;

  return (
    <div
      className={cn(
        'rounded-2xl border bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-shadow hover:shadow-md',
        is_active
          ? 'border-slate-200 dark:border-slate-800'
          : 'border-slate-200 dark:border-slate-800 opacity-60',
        className,
      )}
      data-testid="company-card"
    >
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
              is_active
                ? 'bg-blue-50 dark:bg-blue-900/20'
                : 'bg-slate-100 dark:bg-slate-800',
            )}>
              <Building2 className={cn(
                'w-5 h-5',
                is_active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400',
              )} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate leading-snug">
                {company_name}
              </p>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{maskNip(nip)}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {is_active
              ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" />Aktywna
                </span>
              : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-500 dark:text-red-400">
                  <XCircle className="w-3 h-3" />Nieaktywna
                </span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <ProductBadge type={product_type} />
        </div>
      </div>

      <div className="px-5 pb-2 border-t border-slate-100 dark:border-slate-800">
        <StatRow
          icon={Users}
          label="Użytkownicy"
          value={usersDisplay}
          warn={usersAtLimit}
        />
        <StatRow
          icon={Receipt}
          label="Fakturowanie"
          value={
            invoicing_enabled
              ? <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" />Włączone
                </span>
              : <span className="flex items-center gap-1 text-slate-400">
                  <XCircle className="w-3 h-3" />Wyłączone
                </span>
          }
        />
      </div>

      <div className="px-5 pb-5 pt-3 flex flex-wrap gap-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5 flex-1"
        >
          <Link href={`/admin/users?company_id=${company_id}`}>
            <Users className="w-3.5 h-3.5" />
            Użytkownicy
            <ChevronRight className="w-3 h-3 ml-auto" />
          </Link>
        </Button>

        {isOwner && onManageProduct && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 flex-1"
            onClick={() => onManageProduct(company_id)}
          >
            <Package className="w-3.5 h-3.5" />
            Zmień plan
          </Button>
        )}
      </div>
    </div>
  );
}
