import { Header } from '@/components/layout/header';
import { CompanyVendorTable } from '@/components/vendors/company-vendor-table';
import { pl as t } from '@/lib/i18n/pl';

export default function VendorsPage() {
  return (
    <div className="flex flex-col">
      <Header
        title={t.vendors.title}
        description={t.vendors.subtitle}
      />
      <div className="p-6">
        <CompanyVendorTable />
      </div>
    </div>
  );
}
