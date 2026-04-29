import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DemoInvoiceTable } from '@/components/demo/demo-invoice-table';
import demoInvoices from '@/data/demoInvoices.json';
import { pl as t } from '@/lib/i18n/pl';

export default function DemoInvoicesPage() {
  return (
    <div className="flex flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-6">
        <div>
          <h1 className="text-lg font-semibold">{t.invoices.title}</h1>
          <p className="text-xs text-muted-foreground">{t.invoices.subtitle}</p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href="/login">{t.demo.upgradeButton}</Link>
        </Button>
      </header>

      <div className="p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {t.demo.sampleDataNotice}
          </p>
          <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
            <Link href="/login">
              {t.demo.upgradeButton}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <DemoInvoiceTable invoices={demoInvoices} />
      </div>
    </div>
  );
}
