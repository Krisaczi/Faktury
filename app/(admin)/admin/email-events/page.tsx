import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { Stack, PageHeader } from '@/components/ui/layout-primitives';
import { getEmailEvents } from './actions';
import { EmailEventsClient } from './email-events-client';

export const metadata = { title: 'Admin — Zdarzenia e-mail' };

export default async function EmailEventsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: u } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) redirect('/onboarding');
  if (!['owner'].includes(u.role ?? '')) {
    redirect('/dashboard');
  }

  const { rows, totalCount } = await getEmailEvents(20);

  return (
    <Stack gap="6" className="max-w-5xl">
      <PageHeader
        title="Zdarzenia e-mail"
        description="Ostatnie 20 zdarzeń przychodzącej poczty e-mail (faktury wysyłane na adresy ingestion)."
      />
      <EmailEventsClient events={rows} totalCount={totalCount} />
    </Stack>
  );
}
