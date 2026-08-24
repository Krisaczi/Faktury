import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /api/owner/users/:id/usage?period=YYYY-MM
 *
 * Returns usage metrics for the selected user's company for the given period.
 * Owner-only endpoint.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: u } = await (supabase as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (u?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const periodParam = req.nextUrl.searchParams.get('period');
  const now = new Date();

  let periodYear: number;
  let periodMonth: number;

  if (periodParam && /^\d{4}-\d{2}$/.test(periodParam)) {
    const [y, m] = periodParam.split('-');
    periodYear = Number(y);
    periodMonth = Number(m);
  } else {
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    periodYear = prevMonth.getFullYear();
    periodMonth = prevMonth.getMonth() + 1;
  }

  const periodStart = new Date(periodYear, periodMonth - 1, 1);
  const periodEnd = new Date(periodYear, periodMonth, 0);
  const periodStartIso = periodStart.toISOString();
  const periodEndIso = new Date(periodYear, periodMonth, 0, 23, 59, 59).toISOString();

  // Get target user (full_name lives in profiles, not users)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targetUser } = await (supabase as any)
    .from('users')
    .select('id, email, company_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!targetUser) {
    return NextResponse.json({ error: 'Użytkownik nie znaleziony.' }, { status: 404 });
  }
  if (!targetUser.company_id) {
    return NextResponse.json({ error: 'Użytkownik nie ma firmy.' }, { status: 400 });
  }

  // Get profile for full_name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('full_name')
    .eq('id', params.id)
    .maybeSingle();

  // Get company — column names: city, street, zip, is_active (not address_*, active, email)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('id, name, nip, city, street, zip, product_type, is_active')
    .eq('id', targetUser.company_id)
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ error: 'Firma nie znaleziona.' }, { status: 404 });
  }

  // Get pricing tier info (read-only)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tier } = await (supabase as any)
    .from('pricing_tiers')
    .select('key, name, monthly_price_cents, limits')
    .eq('key', company.product_type ?? 'starter')
    .maybeSingle();

  // Count active users in company
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: activeUsers } = await (supabase as any)
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', targetUser.company_id)
    .eq('active', true);

  // Count vendors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: vendorCount } = await (supabase as any)
    .from('vendors')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', targetUser.company_id);

  // Count invoices processed in period
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: invoiceCount } = await (supabase as any)
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', targetUser.company_id)
    .gte('created_at', periodStartIso)
    .lte('created_at', periodEndIso);

  // Count issued invoices in period
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: issuedInvoiceCount } = await (supabase as any)
    .from('issued_invoices')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', targetUser.company_id)
    .gte('created_at', periodStartIso)
    .lte('created_at', periodEndIso);

  // risk_reports uses user_id, not company_id — count via users in this company
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: companyUserIds } = await (supabase as any)
    .from('users')
    .select('id')
    .eq('company_id', targetUser.company_id);

  let reportCount = 0;
  if (companyUserIds && companyUserIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from('risk_reports')
      .select('*', { count: 'exact', head: true })
      .in('user_id', companyUserIds.map((cu: { id: string }) => cu.id))
      .gte('created_at', periodStartIso)
      .lte('created_at', periodEndIso);
    reportCount = count ?? 0;
  }

  return NextResponse.json({
    user: {
      id:       targetUser.id,
      email:    targetUser.email,
      fullName: profile?.full_name ?? null,
    },
    company: {
      id:           company.id,
      name:         company.name,
      nip:          company.nip,
      city:         company.city,
      street:       company.street,
      postalCode:   company.zip,
      productType:  company.product_type ?? 'starter',
      isActive:     company.is_active ?? true,
    },
    plan: {
      key:               tier?.key ?? company.product_type ?? 'starter',
      name:              tier?.name ?? 'Starter',
      monthlyPriceCents: tier?.monthly_price_cents ?? 0,
      limits:            tier?.limits ?? null,
    },
    usage: {
      activeUsers,
      vendorCount,
      invoiceCount,
      reportCount,
      issuedInvoiceCount,
    },
    period: {
      year:       periodYear,
      month:      periodMonth,
      start:      periodStart.toISOString().split('T')[0],
      end:        periodEnd.toISOString().split('T')[0],
      label:      `${periodYear}-${String(periodMonth).padStart(2, '0')}`,
    },
  });
}
