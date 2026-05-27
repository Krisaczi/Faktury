import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { InvoiceForm } from '@/components/admin/invoice-form';
import { PageHeader, Stack } from '@/components/ui/layout-primitives';
import { canWriteInvoice, type AppRole } from '@/lib/permissions';

export const metadata = { title: 'Admin — Nowa faktura' };

async function getSellerDefaults() {
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

  return {
    name:    company.name,
    nip:     company.nip ?? '',
    address: '',
    role:    (userRecord.role ?? 'member') as AppRole,
  };
}

export default async function NewInvoicePage() {
  const defaults = await getSellerDefaults();

  // Hard block for non-writers — extra safety layer on top of the layout guard
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
      />
    </Stack>
  );
}
