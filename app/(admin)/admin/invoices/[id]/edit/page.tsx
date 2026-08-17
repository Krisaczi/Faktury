import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { canWriteInvoice, type AppRole } from '@/lib/permissions';
import { InvoiceForm } from '@/components/admin/invoice-form';
import { PageHeader, Stack } from '@/components/ui/layout-primitives';
import type { IssuedInvoiceWithItems } from '@/types/issued-invoice';
import type { VatRate } from '@/types/issued-invoice';
import type { Customer } from '@/components/invoice/customer-picker';

export const metadata = { title: 'Admin — Edytuj fakturę' };

async function fetchInvoice(id: string): Promise<IssuedInvoiceWithItems | null> {
  const supabase = await getSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice, error } = await (supabase as any)
    .from('issued_invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !invoice) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items } = await (supabase as any)
    .from('issued_invoice_items')
    .select('*')
    .eq('invoice_id', id)
    .order('position', { ascending: true });

  return { ...invoice, items: items ?? [] };
}

export default async function EditInvoicePage({
  params,
}: {
  params: { id: string };
}) {
  // Role + package guard — viewers cannot reach edit page
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: userRecord } = user
    ? await supabase.from('users').select('role, company_id').eq('id', user.id).maybeSingle()
    : { data: null };
  const role = (userRecord?.role ?? 'accountant') as AppRole;

  let packageType: string | null = null;
  if (userRecord?.company_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('product_type')
      .eq('id', userRecord.company_id)
      .maybeSingle();
    packageType = company?.product_type ?? null;
  }

  if (!canWriteInvoice(role, packageType)) redirect(`/admin/invoices/${params.id}`);

  const invoice = await fetchInvoice(params.id);
  if (!invoice) notFound();

  // Only drafts are editable
  if (invoice.status !== 'draft') {
    notFound();
  }

  const defaultValues = {
    invoice_number:      invoice.invoice_number,
    currency:            invoice.currency,
    issue_date:          invoice.issue_date,
    sale_date:           invoice.sale_date ?? undefined,
    due_date:            invoice.due_date ?? undefined,
    payment_method:      invoice.payment_method as 'transfer' | 'cash' | 'card' | 'other',
    seller_name:         invoice.seller_name,
    seller_nip:          invoice.seller_nip,
    seller_address:      invoice.seller_address,
    seller_bank_account: invoice.seller_bank_account ?? undefined,
    buyer_name:          invoice.buyer_name,
    buyer_nip:           invoice.buyer_nip ?? undefined,
    buyer_address:       invoice.buyer_address ?? undefined,
    buyer_email:         invoice.buyer_email ?? undefined,
    buyer_company_id:    invoice.buyer_company_id ?? undefined,
    notes:               invoice.notes ?? undefined,
    items: invoice.items.map((item) => ({
      name:           item.name,
      unit:           item.unit,
      quantity:       item.quantity,
      unit_price_net: item.unit_price_net,
      vat_rate:       item.vat_rate as VatRate,
      discount_pct:   item.discount_pct ?? undefined,
    })),
  };

  // Fetch buyer company for the picker if linked
  let initialCustomer: Customer | null = null;
  if (invoice.buyer_company_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bc } = await (supabase as any)
      .from('buyer_companies')
      .select('id, name, nip, street, postal_code, city, country, email, phone, billing_email, last_used_at')
      .eq('id', invoice.buyer_company_id)
      .maybeSingle();
    if (bc) initialCustomer = bc as Customer;
  }

  return (
    <Stack gap="6" className="max-w-5xl">
      <div>
        <Link
          href={`/admin/invoices/${params.id}`}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors w-fit mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Wróć do faktury
        </Link>
        <PageHeader
          title={`Edytuj fakturę ${invoice.invoice_number}`}
          description="Modyfikuj dane szkicu. Wystawienie nada fakturze numer."
        />
      </div>

      <InvoiceForm
        mode="edit"
        invoiceId={params.id}
        defaultValues={defaultValues}
        initialCustomer={initialCustomer}
      />
    </Stack>
  );
}
