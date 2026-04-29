import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin/is-admin';
import { AdminCompaniesView } from '@/components/admin/admin-companies-view';

export default async function AdminCompaniesPage() {
  const adminCheck = await isAdmin();
  if (!adminCheck) redirect('/dashboard');

  const supabase = createClient();

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, nip, subscription_status, trial_end, created_at, is_demo')
    .order('created_at', { ascending: false });

  return <AdminCompaniesView companies={companies ?? []} />;
}
