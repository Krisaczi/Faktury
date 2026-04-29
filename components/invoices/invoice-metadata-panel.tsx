'use client';

import { Download, Building2, CreditCard, Hash, CalendarDays, CircleDollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { InvoiceDetail } from '@/hooks/use-invoice-detail';
import { useT } from '@/providers/i18n-provider';

interface Props {
  invoice: InvoiceDetail;
}

const formatCurrency = (amount: number, currency: string) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: currency || 'PLN' }).format(amount);

const formatDate = (date: string | null) =>
  date ? new Date(date).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

interface FieldProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function Field({ label, value, mono }: FieldProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={cn('text-sm text-foreground', mono && 'font-mono text-xs break-all')}>
        {value || '—'}
      </span>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

export function InvoiceMetadataPanel({ invoice }: Props) {
  const t = useT();

  const riskConfig: Record<string, { label: string; className: string }> = {
    high: { label: t.invoiceDetail.riskLabels.high, className: 'bg-rose-100 text-rose-700 border-rose-200' },
    medium: { label: t.invoiceDetail.riskLabels.medium, className: 'bg-amber-100 text-amber-700 border-amber-200' },
    low: { label: t.invoiceDetail.riskLabels.low, className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    none: { label: t.invoiceDetail.riskLabels.none, className: 'bg-slate-100 text-slate-500 border-slate-200' },
  };

  function getRisk(r: string) {
    return riskConfig[r?.toLowerCase()] ?? riskConfig['none'];
  }

  const risk = getRisk(invoice.overall_risk);
  const vendor = invoice.company_vendors;

  const handleDownloadXml = () => {
    if (!invoice.xml_raw) return;
    const blob = new Blob([invoice.xml_raw], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${invoice.invoice_number || invoice.id}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold tracking-tight">
            {invoice.invoice_number || 'Invoice'}
          </h2>
          <Badge
            variant="outline"
            className={cn('w-fit text-xs font-medium', risk.className)}
          >
            {risk.label}
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleDownloadXml}
          disabled={!invoice.xml_raw}
          className="shrink-0 gap-2"
        >
          <Download className="h-3.5 w-3.5" />
          {t.invoiceDetail.downloadXml}
        </Button>
      </div>

      <Separator />

      <Section title={t.invoiceDetail.sectionInvoiceDetails} icon={CircleDollarSign}>
        <Field label={t.invoiceDetail.fieldInvoiceNumber} value={invoice.invoice_number} />
        <Field label={t.invoiceDetail.fieldAmount} value={formatCurrency(invoice.amount, invoice.currency)} />
        <Field label={t.invoiceDetail.fieldIssueDate} value={formatDate(invoice.issue_date)} />
        <Field label={t.invoiceDetail.fieldDueDate} value={formatDate(invoice.due_date)} />
        <Field label={t.invoiceDetail.fieldCurrency} value={invoice.currency} />
        <Field label={t.invoiceDetail.fieldOverallRisk} value={
          <Badge variant="outline" className={cn('text-xs', risk.className)}>{risk.label}</Badge>
        } />
      </Section>

      <Separator />

      <Section title={t.invoiceDetail.sectionVendor} icon={Building2}>
        <Field label={t.invoiceDetail.fieldSellerName} value={vendor?.name || invoice.seller_name} />
        <Field label={t.invoiceDetail.fieldSellerNip} value={invoice.seller_nip} mono />
        <Field label={t.invoiceDetail.fieldBuyerNip} value={invoice.buyer_nip} mono />
        {vendor && (
          <Field
            label={t.invoiceDetail.fieldAvgInvoice}
            value={formatCurrency(vendor.avg_amount, invoice.currency)}
          />
        )}
      </Section>

      <Separator />

      <Section title={t.invoiceDetail.sectionBankAccount} icon={CreditCard}>
        <div className="sm:col-span-2">
          <Field label={t.invoiceDetail.fieldPaymentAccount} value={invoice.bank_account} mono />
        </div>
        {vendor && vendor.bank_accounts?.length > 0 && (
          <div className="sm:col-span-2 flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t.invoiceDetail.fieldKnownAccounts}
            </span>
            <div className="flex flex-col gap-1.5">
              {vendor.bank_accounts.map((acc, i) => {
                const normalized = acc.replace(/\s/g, '');
                const invoiceNorm = invoice.bank_account?.replace(/\s/g, '') ?? '';
                const matches = normalized === invoiceNorm;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className={cn(
                        'font-mono text-xs break-all',
                        matches ? 'text-emerald-600' : 'text-muted-foreground'
                      )}
                    >
                      {acc}
                    </span>
                    {matches && (
                      <Badge variant="outline" className="h-4 shrink-0 bg-emerald-50 text-[10px] text-emerald-600 border-emerald-200">
                        {t.invoiceDetail.match}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      <Separator />

      <Section title={t.invoiceDetail.sectionKsefRef} icon={Hash}>
        <div className="sm:col-span-2">
          <Field label={t.invoiceDetail.fieldRefNumber} value={invoice.ksef_reference} mono />
        </div>
      </Section>

      <div className="flex flex-col gap-1 pt-1">
        <span className="text-[11px] text-muted-foreground">
          {t.invoiceDetail.fieldCreated}: {formatDate(invoice.created_at)}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {t.invoiceDetail.fieldUpdated}: {formatDate(invoice.updated_at)}
        </span>
      </div>
    </div>
  );
}
