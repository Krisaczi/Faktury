import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { canManageCustomers, type AppRole } from '@/lib/permissions';
import { Stack, PageHeader } from '@/components/ui/layout-primitives';
import { CustomersClient } from './customers-client';

export const metadata = { title: 'Klienci — Bezpieczne Faktury' };

export default async function CustomersPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userRecord } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!userRecord?.company_id) redirect('/onboarding');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('product_type')
    .eq('id', userRecord.company_id)
    .maybeSingle();

  const role        = (userRecord.role ?? 'accountant') as AppRole;
  const packageType = company?.product_type ?? null;

  if (!canManageCustomers(role, packageType)) {
    redirect('/dashboard');
  }

  return (
    <Stack gap="6">
      <PageHeader
        title="Klienci"
        description="Zarządzaj bazą klientów — dodawaj, edytuj i przypisuj do faktur."
      />
      <CustomersClient />
    </Stack>
  );
}
