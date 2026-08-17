import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader, Stack } from '@/components/ui/layout-primitives';
import { OwnerDashboard, type PlanChangeEntry } from '@/components/admin/owner-dashboard';
import { getOwnerDashboard, getOwnerAuditLogs } from '@/app/(admin)/admin/owner/actions';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
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

  // Fetch recent plan changes for the widget
  const serviceClient = getSupabaseServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: planChangesData } = await (serviceClient as any)
    .from('plan_change_audit')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  const planChanges = (planChangesData ?? []) as PlanChangeEntry[];

  return (
    <Stack gap="6" className="max-w-7xl">
      <PageHeader
        title="Pulpit właściciela"
        description="Przegląd wszystkich firm, metryki fakturowania i zarządzanie cennikami."
      />
      <OwnerDashboard data={dashData} auditLogs={auditLogs} planChanges={planChanges} />
    </Stack>
  );
}
