import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { InvoiceForm } from '@/components/admin/invoice-form';
import { PageHeader, Stack } from '@/components/ui/layout-primitives';
import { canWriteInvoice, type AppRole } from '@/lib/permissions';
import { getBuyerCompanyById } from '@/app/(admin)/admin/companies/actions';

export const metadata = { title: 'Admin — Nowa faktura' };

async function getSellerDefaults(buyerCompanyId?: string) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return undefined;

  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!userRecord?.company_id) return undefined;

  const { data: company } = await supabase
    .from('companies')
    .select('name, nip')
    .eq('id', userRecord.company_id)
    .maybeSingle();

  if (!company) return undefined;

  // Prefill buyer if a buyer_company_id was provided
  let buyerDefaults: {
    buyer_name?:    string;
    buyer_nip?:     string;
    buyer_address?: string;
    buyer_email?:   string;
  } | undefined;

  if (buyerCompanyId) {
    const detail = await getBuyerCompanyById(buyerCompanyId);
    if (detail) {
      const bc = detail.company;
      const addressParts = [bc.street, bc.postal_code, bc.city, bc.country].filter(Boolean).join(', ');
      buyerDefaults = {
        buyer_name:    bc.name,
        buyer_nip:     bc.nip ?? undefined,
        buyer_address: addressParts || undefined,
        buyer_email:   bc.billing_email ?? bc.email ?? undefined,
      };
    }
  }

  return {
    name:          company.name,
    nip:           company.nip ?? '',
    address:       '',
    role:          (userRecord.role ?? 'member') as AppRole,
    buyerDefaults,
  };
}

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: { buyer_company_id?: string };
}) {
  const defaults = await getSellerDefaults(searchParams.buyer_company_id);

  if (!canWriteInvoice(defaults?.role)) redirect('/admin/invoices');

  const sellerDefaults = defaults
    ? { name: defaults.name, nip: defaults.nip, address: defaults.address }
    : undefined;

  return (
    <Stack gap="6" className="max-w-5xl">
      <div>
        <Link
          href="/admin/invoices"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors w-fit mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Wróć do listy
        </Link>
        <PageHeader
          title="Nowa faktura"
          description="Wypełnij formularz, aby wystawić fakturę lub zapisać szkic."
        />
      </div>

      <InvoiceForm
        mode="create"
        sellerDefaults={sellerDefaults}
        buyerDefaults={defaults?.buyerDefaults}
      />
    </Stack>
  );
}
