import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { Stack, PageHeader } from '@/components/ui/layout-primitives';
import { findOrphanedAccounts } from '@/lib/auth/orphan-repair';
import { AuthOrphansClient } from './auth-orphans-client';

export const metadata = { title: 'Admin — Auth Orphans' };

export default async function AuthOrphansPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: u } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!u || !['owner', 'admin'].includes(u.role ?? '')) {
    redirect('/dashboard');
  }

  const result = await findOrphanedAccounts({ limit: 200 });

  return (
    <Stack gap="6" className="max-w-5xl">
      <PageHeader
        title="Auth Orphans"
        description="Auth accounts without app profiles, and app profiles without auth accounts"
      />
      <AuthOrphansClient
        initialReport={result.ok ? result.report : null}
        isOwner={u.role === 'owner'}
      />
    </Stack>
  );
}
