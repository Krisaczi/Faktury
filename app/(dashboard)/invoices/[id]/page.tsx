'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CircleAlert as AlertCircle } from 'lucide-react';
import { useInvoiceDetail } from '@/hooks/use-invoice-detail';
import { Header } from '@/components/layout/header';
import { InvoiceMetadataPanel } from '@/components/invoices/invoice-metadata-panel';
import { InvoiceRiskPanel } from '@/components/invoices/invoice-risk-panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/providers/i18n-provider';

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full max-w-[60%]" />
        ))}
      </div>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: invoice, isLoading, error } = useInvoiceDetail(id ?? null);
  const t = useT();

  return (
    <div className="flex flex-col">
      <Header
        title={t.invoiceDetail.title}
        description={invoice ? `${t.invoiceDetail.sectionInvoiceDetails} ${invoice.invoice_number}` : t.invoiceDetail.loading}
      />
      <div className="flex flex-col gap-6 p-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/invoices')}
          className="w-fit gap-2 text-muted-foreground hover:text-foreground -ml-1"
        >
          <ArrowLeft className="h-4 w-4" />
          {t.invoiceDetail.backToInvoices}
        </Button>

        {isLoading ? (
          <LoadingSkeleton />
        ) : error || !invoice ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card py-20 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              {error ? t.invoiceDetail.failedToLoad : t.invoiceDetail.notFound}
            </p>
            <Button variant="outline" size="sm" onClick={() => router.push('/invoices')}>
              {t.invoiceDetail.returnToInvoices}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
            <InvoiceMetadataPanel invoice={invoice} />
            <InvoiceRiskPanel invoice={invoice} />
          </div>
        )}
      </div>
    </div>
  );
}
