import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2, Phone, Receipt } from 'lucide-react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { Stack, PageHeader } from '@/components/ui/layout-primitives';
import { Badge } from '@/components/ui/badge';
import { getBuyerCompanyById } from '@/app/(admin)/admin/companies/actions';
import type { BuyerCompanyFormValues } from '@/app/(admin)/admin/companies/types';
import { CompanyDetailClient } from './company-detail-client';
import { PackageCard } from '@/components/admin/package-card';
import { getCompanyPackage, getCompanyUsage } from '@/lib/packages/get-company-package';
import { getCompanyPackageAudit, getPricingTiers } from '@/lib/packages/actions';
import type { AppRole } from '@/lib/permissions';

export const metadata = { title: 'Admin — Kontrahent' };

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-xs text-slate-400 w-40 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-800 dark:text-slate-200 font-medium">{value || <span className="text-slate-300 dark:text-slate-600 font-normal">—</span>}</span>
    </div>
  );
}

export default async function CompanyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: u } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  const role = (u?.role ?? 'member') as AppRole;
  const isOwner = role === 'owner';
  const tenantCompanyId = u?.company_id as string | undefined;

  const detail = await getBuyerCompanyById(params.id);
  if (!detail) notFound();

  const { company, contacts, invoiceCount } = detail;

  // Load package data for the SaaS tenant company
  const [pkg, usage, tiers, audit] = tenantCompanyId
    ? await Promise.all([
        getCompanyPackage(tenantCompanyId),
        getCompanyUsage(tenantCompanyId),
        getPricingTiers(),
        getCompanyPackageAudit(tenantCompanyId, 10),
      ])
    : [null, null, [], []];

  const addressParts = [company.street, company.postal_code, company.city, company.country]
    .filter(Boolean)
    .join(', ');

  return (
    <Stack gap="6" className="max-w-4xl">
      <div>
        <Link
          href="/admin/companies"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors w-fit mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Kontrahenci
        </Link>
        <PageHeader
          title={company.name}
          description={company.nip ? `NIP: ${company.nip}` : 'Brak NIP'}
        >
          <Link
            href={`/admin/invoices/new?buyer_company_id=${company.id}`}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20 transition-colors"
          >
            <Receipt className="w-4 h-4" />
            Nowa faktura
          </Link>
        </PageHeader>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: company details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Faktury</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{invoiceCount}</p>
              <Link
                href={`/admin/invoices?buyer_company=${encodeURIComponent(company.name)}`}
                className="text-xs text-blue-600 hover:text-blue-700 mt-1 inline-block"
              >
                Zobacz faktury
              </Link>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Status VAT</p>
              {company.vat_payer
                ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800 font-semibold">Podatnik VAT</Badge>
                : <Badge variant="secondary" className="font-semibold">Zwolniony</Badge>}
            </div>
          </div>

          {/* Company info */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <Building2 className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Dane firmy</h2>
            </div>
            <div className="px-5 py-4">
              <InfoRow label="Nazwa" value={company.name} />
              <InfoRow label="NIP" value={company.nip} />
              <InfoRow
                label="Adres"
                value={addressParts || null}
              />
              <InfoRow label="E-mail" value={company.email} />
              <InfoRow label="Telefon" value={company.phone} />
              <InfoRow label="E-mail do faktur" value={company.billing_email} />
              <InfoRow
                label="Termin płatności"
                value={`${company.default_payment_terms_days} dni`}
              />
              <InfoRow
                label="Metoda płatności"
                value={{
                  transfer: 'Przelew',
                  cash:     'Gotówka',
                  card:     'Karta',
                  other:    'Inne',
                }[company.default_payment_method] ?? company.default_payment_method}
              />
              {company.notes && (
                <div className="pt-3 mt-1">
                  <p className="text-xs text-slate-400 mb-1">Notatki</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{company.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Contacts */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Kontakty</h2>
              </div>
            </div>
            <CompanyDetailClient
              buyerCompanyId={company.id}
              initialContacts={contacts}
              isOwner={isOwner}
            />
          </div>
        </div>

        {/* Right: quick actions + package */}
        <div className="space-y-4">
          {/* Package card */}
          {isOwner && pkg && usage && tenantCompanyId && (
            <PackageCard
              companyId={tenantCompanyId}
              pkg={pkg}
              usage={usage}
              tiers={tiers as unknown as Parameters<typeof PackageCard>[0]['tiers']}
              audit={audit}
              isOwner={isOwner}
            />
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Akcje</h3>

            <Link
              href={`/admin/invoices/new?buyer_company_id=${company.id}`}
              className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm shadow-blue-600/20"
            >
              <Receipt className="w-4 h-4" />
              Wystaw fakturę
            </Link>

            {isOwner && (
              <CompanyDetailClient
                buyerCompanyId={company.id}
                initialContacts={contacts}
                isOwner={isOwner}
                showEditButton
                editDefaults={{
                  name:                       company.name,
                  nip:                        company.nip ?? '',
                  vat_payer:                  company.vat_payer,
                  street:                     company.street ?? '',
                  postal_code:                company.postal_code ?? '',
                  city:                       company.city ?? '',
                  country:                    company.country,
                  email:                      company.email ?? '',
                  phone:                      company.phone ?? '',
                  billing_email:              company.billing_email ?? '',
                  default_payment_terms_days: company.default_payment_terms_days,
                  default_payment_method:     company.default_payment_method,
                  notes:                      company.notes ?? '',
                }}
              />
            )}
          </div>
        </div>
      </div>
    </Stack>
  );
}
