import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin/is-admin';
import { AdminUsersView } from '@/components/admin/admin-users-view';

export default async function AdminUsersPage() {
  const adminCheck = await isAdmin();
  if (!adminCheck) redirect('/dashboard');

  const supabase = createClient();

  const { data: users } = await supabase
    .from('users')
    .select('id, email, role, created_at, onboarded, company_id, is_demo')
    .order('created_at', { ascending: false });

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name');

  const companyMap = new Map((companies ?? []).map((c) => [c.id, c.name]));

  const enrichedUsers = (users ?? []).map((u) => ({
    ...u,
    company_name: u.company_id ? (companyMap.get(u.company_id) ?? null) : null,
  }));

  return <AdminUsersView users={enrichedUsers} />;
}
