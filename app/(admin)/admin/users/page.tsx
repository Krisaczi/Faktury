import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { Stack, PageHeader } from '@/components/ui/layout-primitives';
import { getUsersWithRoles, getRoleChangeLogs } from '@/lib/auth/role-actions';
import { UsersClient } from './users-client';

export const metadata = { title: 'Admin — Zarządzanie użytkownikami' };

export default async function AdminUsersPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: u } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  // Only owner and admin can access this page
  if (!u || !['owner', 'admin'].includes(u.role ?? '')) {
    redirect('/dashboard');
  }

  const isOwner = u.role === 'owner';

  const [usersResult, logs] = await Promise.all([
    getUsersWithRoles({ pageSize: 100 }),
    getRoleChangeLogs(undefined, 50),
  ]);

  const users = usersResult.ok ? usersResult.data.rows : [];

  return (
    <Stack gap="6" className="max-w-5xl">
      <PageHeader
        title="Użytkownicy"
        description="Zarządzaj rolami członków Twojej organizacji"
      />
      <UsersClient
        currentUserId={user.id}
        isOwner={isOwner}
        initialUsers={users}
        initialLogs={logs}
      />
    </Stack>
  );
}
