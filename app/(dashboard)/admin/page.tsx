import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin/is-admin';
import { AdminOverview } from '@/components/admin/admin-overview';

export default async function AdminPage() {
  const adminCheck = await isAdmin();
  if (!adminCheck) redirect('/dashboard');

  const supabase = createClient();

  const [{ data: users }, { data: companies }] = await Promise.all([
    supabase
      .from('users')
      .select('id, email, role, created_at, is_demo')
      .order('created_at', { ascending: false }),
    supabase
      .from('companies')
      .select('id, name, subscription_status, trial_end, created_at, is_demo')
      .order('created_at', { ascending: false }),
  ]);

  return <AdminOverview users={users ?? []} companies={companies ?? []} />;
}
