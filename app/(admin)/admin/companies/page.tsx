import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader, Stack } from '@/components/ui/layout-primitives';
import { CompanyList } from '@/components/admin/company-list';
import { getBuyerCompanies } from '@/app/(admin)/admin/companies/actions';
import type { AppRole } from '@/lib/permissions';

export const metadata = { title: 'Admin — Kontrahenci' };

interface SearchParams {
  q?:    string;
  page?: string;
}

export default async function AdminCompaniesPage({
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

  const role = (u.role ?? 'member') as AppRole;
  const isOwner = role === 'owner';

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const { rows, totalCount } = await getBuyerCompanies({
    page,
    pageSize: 25,
    search:   searchParams.q,
    sortBy:   'created_at',
    sortDir:  'desc',
  });

  return (
    <Stack gap="6" className="max-w-7xl">
      <PageHeader
        title="Kontrahenci"
        description="Baza kupujących — szybkie uzupełnianie danych nabywcy na fakturach."
      />
      <CompanyList
        rows={rows}
        totalCount={totalCount}
        isOwner={isOwner}
        searchParams={searchParams}
      />
    </Stack>
  );
}
