import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { Stack, PageHeader } from '@/components/ui/layout-primitives';
import { getContactMessages } from './actions';
import { ContactMessagesClient } from './contact-messages-client';

export const metadata = { title: 'Admin — Wiadomości kontaktowe' };

interface SearchParams {
  page?:   string;
  status?: string;
  q?:      string;
}

export default async function ContactMessagesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: u } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) redirect('/onboarding');
  if (!['owner', 'admin'].includes(u.role ?? '')) {
    redirect('/dashboard');
  }

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const status = (searchParams.status as 'all' | 'new' | 'read' | 'archived' | 'deleted') ?? 'all';

  const { rows, totalCount } = await getContactMessages({
    page,
    pageSize: 50,
    status,
    search: searchParams.q,
  });

  return (
    <Stack gap="6" className="max-w-5xl">
      <PageHeader
        title="Wiadomości kontaktowe"
        description="Wiadomości z formularza kontaktowego na stronie głównej."
      />
      <ContactMessagesClient initialMessages={rows} totalCount={totalCount} />
    </Stack>
  );
}
