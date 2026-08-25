import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  companyAddressToBilling,
  billingAddressToString,
  type CompanyAddressRow,
} from '@/lib/invoice-address';

/**
 * POST /api/invoices/:id/refresh-address
 * Refreshes the billing address snapshot on a draft invoice from the current
 * company address in Settings. Only works on draft invoices. Owner-only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!userRecord?.company_id) {
    return NextResponse.json({ error: 'No company found' }, { status: 404 });
  }

  const role = userRecord.role ?? 'accountant';
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Tylko właściciel może odświeżyć adres na fakturze.' }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice } = await (supabase as any)
    .from('issued_invoices')
    .select('id, status, company_id, billing_address_snapshot')
    .eq('id', params.id)
    .eq('company_id', userRecord.company_id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: 'Faktura nie istnieje lub brak dostępu.' }, { status: 404 });
  }

  if (invoice.status !== 'draft') {
    return NextResponse.json({ error: 'Tylko szkice mogą mieć odświeżony adres.' }, { status: 400 });
  }

  const { data: companyRow } = await supabase
    .from('companies')
    .select('street, address_line2, city, zip, state_region, country, nip')
    .eq('id', userRecord.company_id)
    .maybeSingle();

  const newSnapshot = companyAddressToBilling(companyRow as CompanyAddressRow);
  const sellerAddressString = billingAddressToString(newSnapshot);
  const nowIso = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (supabase as any)
    .from('issued_invoices')
    .update({
      billing_address_snapshot: newSnapshot as any,
      billing_address_source: 'company_settings',
      billing_address_last_synced_at: nowIso,
      seller_address: sellerAddressString,
      updated_at: nowIso,
    })
    .eq('id', params.id);

  if (updateErr) {
    return NextResponse.json({ error: 'Błąd odświeżania adresu.' }, { status: 500 });
  }

  // Audit the refresh
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('invoice_audit').insert({
    invoice_id: params.id,
    company_id: userRecord.company_id,
    actor_id: user.id,
    actor_role: role,
    event: 'address_snapshot_refreshed',
    source: 'company_settings',
    before: invoice.billing_address_snapshot as any,
    after: newSnapshot as any,
  });

  return NextResponse.json({ ok: true, address: newSnapshot });
}
