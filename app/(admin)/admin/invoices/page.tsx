import { Suspense } from 'react';
import Link from 'next/link';
import { Plus, BarChart2 } from 'lucide-react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { AdminInvoiceTable } from '@/components/admin/admin-invoice-table';
import { PageHeader, Stack } from '@/components/ui/layout-primitives';
import { SkeletonList } from '@/components/ui/skeleton-loaders';
import type { IssuedInvoiceRow } from '@/types/issued-invoice';
import { canWriteInvoice, type AppRole } from '@/lib/permissions';

export const metadata = { title: 'Admin — Faktury wystawione' };

// Re-export type for the client component
export type AdminInvoiceListItem = Pick<
  IssuedInvoiceRow,
  | 'id'
  | 'invoice_number'
  | 'buyer_name'
  | 'buyer_nip'
  | 'issue_date'
  | 'gross_total'
  | 'currency'
  | 'status'
  | 'ksef_status'
  | 'created_at'
>;

interface SearchParams {
  q?: string;
  status?: string;
  ksef_status?: string;
  from?: string;
  to?: string;
  page?: string;
}

async function fetchInvoices(params: SearchParams): Promise<{
  rows: AdminInvoiceListItem[];
  totalCount: number;
}> {
  const supabase = await getSupabaseServerClient();
  const PAGE_SIZE = 25;
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('issued_invoices')
    .select(
      'id, invoice_number, buyer_name, buyer_nip, issue_date, gross_total, currency, status, ksef_status, created_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (params.q) {
    query = query.or(
      `invoice_number.ilike.%${params.q}%,buyer_name.ilike.%${params.q}%,buyer_nip.ilike.%${params.q}%`
    );
  }
  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }
  if (params.ksef_status && params.ksef_status !== 'all') {
    query = query.eq('ksef_status', params.ksef_status);
  }
  if (params.from) {
    query = query.gte('issue_date', params.from);
  }
  if (params.to) {
    query = query.lte('issue_date', params.to);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    rows: (data ?? []) as AdminInvoiceListItem[],
    totalCount: count ?? 0,
  };
}

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: userRecord } = user
    ? await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  const role = (userRecord?.role ?? 'member') as AppRole;

  const { rows, totalCount } = await fetchInvoices(searchParams);

  return (
    <Stack gap="6" className="max-w-7xl">
      <PageHeader
        title="Faktury wystawione"
        description="Zarządzaj wszystkimi fakturami wystawionymi przez platformę."
      >
        <Link
          href="/admin/invoices/analytics"
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <BarChart2 className="w-4 h-4" />
          Analityka
        </Link>
        {canWriteInvoice(role) && (
          <Link
            href="/admin/invoices/new"
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nowa faktura
          </Link>
        )}
      </PageHeader>
      <Suspense fallback={<SkeletonList rows={10} hasIcon />}>
        <AdminInvoiceTable
          rows={rows}
          totalCount={totalCount}
          searchParams={searchParams}
        />
      </Suspense>
    </Stack>
  );
}
