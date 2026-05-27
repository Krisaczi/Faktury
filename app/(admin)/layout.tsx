import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { RoleProvider } from '@/components/providers/role-provider';
import { canAccessInvoicing, type AppRole } from '@/lib/permissions';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: userRecord } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!userRecord?.company_id) {
    redirect('/onboarding');
  }

  // Allow owner, admin, accountant, viewer into the invoicing module.
  // Plain members (no invoicing access) are redirected back to the app.
  if (!canAccessInvoicing(userRecord.role)) {
    redirect('/dashboard');
  }

  const role = (userRecord.role ?? 'member') as AppRole;

  return (
    <RoleProvider role={role}>
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
        <div className="hidden md:flex">
          <Sidebar />
        </div>
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </RoleProvider>
  );
}
