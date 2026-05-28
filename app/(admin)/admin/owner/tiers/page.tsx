import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { Stack, PageHeader } from '@/components/ui/layout-primitives';
import { PricingTiersClient } from './tiers-client';

export const metadata = { title: 'Admin — Pakiety cenowe' };

export default async function PricingTiersPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: u } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (u?.role !== 'owner') redirect('/dashboard');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tiers } = await (supabase as any)
    .from('pricing_tiers')
    .select('*')
    .order('monthly_price_cents', { ascending: true });

  // Companies per tier counts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tierCounts } = await (supabase as any)
    .from('companies')
    .select('package_type, package_id')
    .not('id', 'is', null);

  const countMap: Record<string, number> = {};
  for (const c of (tierCounts ?? [])) {
    const k = (c.package_id as string | null) ?? c.package_type;
    countMap[k] = (countMap[k] ?? 0) + 1;
  }

  return (
    <Stack gap="6" className="max-w-4xl">
      <PageHeader
        title="Pakiety cenowe"
        description="Zarządzaj pakietami Starter, Pro i konfiguracją tiers"
      />
      <PricingTiersClient
        initialTiers={(tiers ?? []) as Parameters<typeof PricingTiersClient>[0]['initialTiers']}
        tierCounts={countMap}
      />
    </Stack>
  );
}
