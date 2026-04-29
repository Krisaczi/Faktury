import { Header } from '@/components/layout/header';
import { InvoiceTable } from '@/components/invoices/invoice-table';
import { pl as t } from '@/lib/i18n/pl';

export default function InvoicesPage() {
  return (
    <div className="flex flex-col">
      <Header
        title={t.invoices.title}
        description={t.invoices.subtitle}
      />
      <div className="p-6">
        <InvoiceTable />
      </div>
    </div>
  );
}
