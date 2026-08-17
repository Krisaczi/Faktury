import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader, Stack } from '@/components/ui/layout-primitives';
import { getCustomerAuditEvents } from './actions';
import { CustomerAuditClient } from './customer-audit-client';

export const metadata = { title: 'Admin — Zdarzenia klientów' };

export default async function CustomerAuditPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: u } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!['owner'].includes(u?.role ?? 'accountant')) {
    redirect('/admin/invoices');
  }

  const { rows, totalCount } = await getCustomerAuditEvents(50);

  return (
    <Stack gap="6">
      <PageHeader
        title="Zdarzenia klientów"
        description="Log tworzenia klientów, błędów walidacji i zablokowanych duplikatów."
      />
      <CustomerAuditClient initialRows={rows} totalCount={totalCount} />
    </Stack>
  );
}
