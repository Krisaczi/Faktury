'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Building2, Users, Receipt, Zap, Star, Clock, CircleCheck as CheckCircle2, Circle as XCircle, TriangleAlert as AlertTriangle, ChevronRight, Bell, Package } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CompanyCardData } from '@/lib/packages/actions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return '—';
  try { return format(parseISO(d), 'd MMM yyyy', { locale: pl }); } catch { return d; }
}

function maskNip(nip: string | null): string {
  if (!nip) return '—';
  if (nip.length < 4) return nip;
  return `••••••${nip.slice(-4)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function TrialBadge({
  trialActive, trialExpired, trialExpiresAt,
}: {
  trialActive: boolean;
  trialExpired: boolean;
  trialExpiresAt: string | null;
}) {
  if (!trialActive && !trialExpired) return null;

  if (trialExpired) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
        <AlertTriangle className="w-2.5 h-2.5" />
        Trial wygasł
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
      <Clock className="w-2.5 h-2.5" />
      Trial do {fmtDate(trialExpiresAt)}
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

// ─── CompanyCard ─────────────────────────────────────────────────────────────

export interface CompanyCardProps {
  data:         CompanyCardData;
  isOwner?:     boolean;
  onManageProduct?: (companyId: string) => void;
  onSendTrialReminder?: (companyId: string) => Promise<void>;
  className?:   string;
}

export function CompanyCard({
  data,
  isOwner = false,
  onManageProduct,
  onSendTrialReminder,
  className,
}: CompanyCardProps) {
  const [reminderSent, setReminderSent]  = useState(false);
  const [isPending, startTransition]     = useTransition();

  const {
    company_id, company_name, nip,
    product_type, trial_active, trial_expired, trial_expires_at,
    current_user_count, allowed_user_limit, invoicing_enabled, is_active,
  } = data;

  const usersAtLimit  = allowed_user_limit !== null && current_user_count >= allowed_user_limit;
  const usersDisplay  = allowed_user_limit !== null
    ? `${current_user_count} / ${allowed_user_limit}`
    : `${current_user_count} / ∞`;

  function handleSendReminder() {
    if (!onSendTrialReminder) return;
    startTransition(async () => {
      await onSendTrialReminder(company_id);
      setReminderSent(true);
    });
  }

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
      {/* Header */}
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

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <ProductBadge type={product_type} />
          <TrialBadge
            trialActive={trial_active}
            trialExpired={trial_expired}
            trialExpiresAt={trial_expires_at}
          />
        </div>
      </div>

      {/* Stats */}
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
        {trial_active && trial_expires_at && !trial_expired && (
          <StatRow
            icon={Clock}
            label="Koniec trialu"
            value={fmtDate(trial_expires_at)}
          />
        )}
      </div>

      {/* Actions */}
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

        {isOwner && onSendTrialReminder && trial_active && !trial_expired && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 text-xs gap-1.5 w-full',
              reminderSent && 'text-emerald-600 dark:text-emerald-400',
            )}
            onClick={handleSendReminder}
            disabled={isPending || reminderSent}
          >
            <Bell className="w-3.5 h-3.5" />
            {reminderSent ? 'Przypomnienie wysłane' : 'Wyślij przypomnienie o trialu'}
          </Button>
        )}
      </div>
    </div>
  );
}
