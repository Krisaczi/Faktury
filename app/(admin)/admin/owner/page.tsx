import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader, Stack } from '@/components/ui/layout-primitives';
import { OwnerDashboard } from '@/components/admin/owner-dashboard';
import { getOwnerDashboard, getOwnerAuditLogs } from '@/app/(admin)/admin/owner/actions';
import type { AppRole } from '@/lib/permissions';

export const metadata = { title: 'Admin — Pulpit właściciela' };

export default async function OwnerDashboardPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: u } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) redirect('/onboarding');
  if ((u.role as AppRole) !== 'owner') redirect('/dashboard');

  const [dashData, auditLogs] = await Promise.all([
    getOwnerDashboard(12),
    getOwnerAuditLogs(30),
  ]);

  return (
    <Stack gap="6" className="max-w-7xl">
      <PageHeader
        title="Pulpit właściciela"
        description="Przegląd wszystkich firm, metryki fakturowania i zarządzanie cennikami."
      />
      <OwnerDashboard data={dashData} auditLogs={auditLogs} />
    </Stack>
  );
}
