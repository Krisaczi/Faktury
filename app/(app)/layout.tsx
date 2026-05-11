import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { DemoProvider } from '@/components/providers/demo-provider';
import { DemoBanner, DemoExpiredOverlay } from '@/components/layout/demo-banner';

const DEMO_COOKIE = 'rg_demo_session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isDemoSession = !!cookieStore.get(DEMO_COOKIE)?.value;

  if (!isDemoSession) {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login');
    }

    // Check if user has a company assigned; if not, send to onboarding
    const { data: userRecord } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) {
      redirect('/onboarding');
    }
  }

  return (
    <DemoProvider>
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
        <div className="hidden md:flex">
          <Sidebar />
        </div>
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <DemoBanner />
          <Topbar />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
      <DemoExpiredOverlay />
    </DemoProvider>
  );
}
