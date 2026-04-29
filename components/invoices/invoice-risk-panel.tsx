'use client';

import Link from 'next/link';
import { ShieldAlert, ShieldCheck, ExternalLink, TriangleAlert as AlertTriangle, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { RiskFlag, InvoiceDetail } from '@/hooks/use-invoice-detail';
import { useT } from '@/providers/i18n-provider';

interface Props {
  invoice: InvoiceDetail;
}

function sortFlags(flags: RiskFlag[]): RiskFlag[] {
  const order = { high: 0, medium: 1, low: 2 };
  return [...flags].sort((a, b) => {
    const ao = order[a.severity as keyof typeof order] ?? 3;
    const bo = order[b.severity as keyof typeof order] ?? 3;
    return ao - bo;
  });
}

function RiskFlagCard({ flag }: { flag: RiskFlag }) {
  const t = useT();

  const severityConfig: Record<string, { label: string; badgeClass: string; rowClass: string; icon: React.ElementType }> = {
    high: {
      label: t.invoiceDetail.severityLabels.high,
      badgeClass: 'bg-rose-100 text-rose-700 border-rose-200',
      rowClass: 'border-rose-100 bg-rose-50/50',
      icon: ShieldAlert,
    },
    medium: {
      label: t.invoiceDetail.severityLabels.medium,
      badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
      rowClass: 'border-amber-100 bg-amber-50/50',
      icon: AlertTriangle,
    },
    low: {
      label: t.invoiceDetail.severityLabels.low,
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      rowClass: 'border-slate-100 bg-slate-50/40',
      icon: Info,
    },
  };

  const FLAG_LABELS: Record<string, string> = {
    DUPLICATE_INVOICE: t.invoiceDetail.flagLabels.DUPLICATE_INVOICE,
    BANK_ACCOUNT_MISMATCH: t.invoiceDetail.flagLabels.BANK_ACCOUNT_MISMATCH,
    AMOUNT_OUTLIER: t.invoiceDetail.flagLabels.AMOUNT_OUTLIER,
    NEW_VENDOR: t.invoiceDetail.flagLabels.NEW_VENDOR,
    MISSING_DUE_DATE: t.invoiceDetail.flagLabels.MISSING_DUE_DATE,
    MISSING_BANK_ACCOUNT: t.invoiceDetail.flagLabels.MISSING_BANK_ACCOUNT,
    MISMATCHED_TOTALS: t.invoiceDetail.flagLabels.MISMATCHED_TOTALS,
  };

  function getSeverity(s: string) {
    return severityConfig[s?.toLowerCase()] ?? severityConfig['low'];
  }

  const config = getSeverity(flag.severity);
  const Icon = config.icon;
  const label = FLAG_LABELS[flag.type] ?? flag.type;

  return (
    <div className={cn('flex gap-3 rounded-lg border p-3.5', config.rowClass)}>
      <Icon className={cn(
        'mt-0.5 h-4 w-4 shrink-0',
        flag.severity === 'high' && 'text-rose-600',
        flag.severity === 'medium' && 'text-amber-600',
        flag.severity === 'low' && 'text-slate-500',
      )} />
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">{label}</span>
          <Badge variant="outline" className={cn('h-5 text-[10px] font-medium', config.badgeClass)}>
            {config.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{flag.message}</p>
      </div>
    </div>
  );
}

export function InvoiceRiskPanel({ invoice }: Props) {
  const t = useT();

  const severityConfig: Record<string, { label: string; badgeClass: string; rowClass: string; icon: React.ElementType }> = {
    high: {
      label: t.invoiceDetail.severityLabels.high,
      badgeClass: 'bg-rose-100 text-rose-700 border-rose-200',
      rowClass: 'border-rose-100 bg-rose-50/50',
      icon: ShieldAlert,
    },
    medium: {
      label: t.invoiceDetail.severityLabels.medium,
      badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
      rowClass: 'border-amber-100 bg-amber-50/50',
      icon: AlertTriangle,
    },
    low: {
      label: t.invoiceDetail.severityLabels.low,
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      rowClass: 'border-slate-100 bg-slate-50/40',
      icon: Info,
    },
  };

  const FLAG_LABELS: Record<string, string> = {
    DUPLICATE_INVOICE: t.invoiceDetail.flagLabels.DUPLICATE_INVOICE,
    BANK_ACCOUNT_MISMATCH: t.invoiceDetail.flagLabels.BANK_ACCOUNT_MISMATCH,
    AMOUNT_OUTLIER: t.invoiceDetail.flagLabels.AMOUNT_OUTLIER,
    NEW_VENDOR: t.invoiceDetail.flagLabels.NEW_VENDOR,
    MISSING_DUE_DATE: t.invoiceDetail.flagLabels.MISSING_DUE_DATE,
    MISSING_BANK_ACCOUNT: t.invoiceDetail.flagLabels.MISSING_BANK_ACCOUNT,
    MISMATCHED_TOTALS: t.invoiceDetail.flagLabels.MISMATCHED_TOTALS,
  };

  const flags = sortFlags(invoice.risk_flags ?? []);
  const vendor = invoice.company_vendors;
  const hasFlags = flags.length > 0;

  const highCount = flags.filter((f) => f.severity === 'high').length;
  const medCount = flags.filter((f) => f.severity === 'medium').length;
  const lowCount = flags.filter((f) => f.severity === 'low').length;

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-bold">{t.invoiceDetail.riskFlags}</h2>
        <p className="text-xs text-muted-foreground">
          {t.invoiceDetail.riskFlagsDesc}
        </p>
      </div>

      {hasFlags && (
        <div className="flex flex-wrap gap-2">
          {highCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              <span className="text-xs font-semibold text-rose-700">{t.invoiceDetail.flagHigh(highCount)}</span>
            </div>
          )}
          {medCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-xs font-semibold text-amber-700">{t.invoiceDetail.flagMedium(medCount)}</span>
            </div>
          )}
          {lowCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              <span className="text-xs font-semibold text-slate-600">{t.invoiceDetail.flagLow(lowCount)}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {!hasFlags ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 py-8 text-center">
            <ShieldCheck className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-semibold text-emerald-700">{t.invoiceDetail.noRiskFlags}</p>
            <p className="text-xs text-emerald-600/80">{t.invoiceDetail.noRiskFlagsDesc}</p>
          </div>
        ) : (
          flags.map((flag) => <RiskFlagCard key={flag.id} flag={flag} />)
        )}
      </div>

      {vendor && (
        <>
          <Separator />
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{t.invoiceDetail.vendorProfile}</h3>
            <div className="rounded-lg border border-border bg-muted/30 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{vendor.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">NIP: {vendor.nip}</span>
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0 gap-1.5 h-8">
                  <Link href={`/vendors/${vendor.id}`}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t.invoiceDetail.viewProfile}
                  </Link>
                </Button>
              </div>
              {vendor.bank_accounts?.length > 0 && (
                <div className="flex flex-col gap-1 pt-1 border-t border-border/60">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t.invoiceDetail.knownAccounts}
                  </span>
                  {vendor.bank_accounts.map((acc, i) => (
                    <span key={i} className="font-mono text-xs text-muted-foreground break-all">
                      {acc}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
