import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [profileResult, companyResult] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user!.id).maybeSingle(),
    supabase
      .from('users')
      .select('company_id, companies(name, currency, subscription_status)')
      .eq('id', user!.id)
      .maybeSingle(),
  ]);

  const firstName = profileResult.data?.full_name?.split(' ')[0] ?? 'there';
  const companyRow = companyResult.data as {
    company_id: string | null;
    companies: { name: string; currency: string; subscription_status: string } | null;
  } | null;

  const company = companyRow?.companies ?? null;

  return (
    <DashboardClient
      firstName={firstName}
      companyName={company?.name ?? null}
      currency={company?.currency ?? 'PLN'}
    />
  );
}
