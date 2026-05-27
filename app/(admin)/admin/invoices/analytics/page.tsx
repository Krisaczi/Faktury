import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { canAccessInvoicing, type AppRole } from '@/lib/permissions';
import { PageHeader, Stack } from '@/components/ui/layout-primitives';
import { InvoiceAnalyticsDashboard } from '@/components/admin/invoice-analytics-dashboard';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata = { title: 'Admin — Analityka faktur' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(s: string | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

export interface MonthlyRow {
  month:         string;
  invoice_count: number;
  net_total:     number;
  gross_total:   number;
  vat_total:     number;
}

export interface StatusRow {
  status:        string;
  invoice_count: number;
  net_total:     number;
  gross_total:   number;
}

export interface KpiSummary {
  total_invoices:     number;
  total_net:          number;
  total_gross:        number;
  total_vat:          number;
  accepted_count:     number;
  rejected_count:     number;
  pending_ksef_count: number;
}

async function fetchAnalytics(
  companyId: string,
  from: string | null,
  to:   string | null,
): Promise<{ monthly: MonthlyRow[]; byStatus: StatusRow[]; kpi: KpiSummary }> {
  const supabase = await getSupabaseServerClient();

  const params = {
    p_company_id: companyId,
    ...(from ? { p_from: from } : {}),
    ...(to   ? { p_to:   to   } : {}),
  };

  const [monthlyRes, statusRes, kpiRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_invoice_monthly_stats', params),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_invoice_status_breakdown', params),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_invoice_kpi_summary', params),
  ]);

  const monthly: MonthlyRow[] = (monthlyRes.data ?? []).map((r: Record<string, unknown>) => ({
    month:         String(r.month),
    invoice_count: Number(r.invoice_count),
    net_total:     Number(r.net_total),
    gross_total:   Number(r.gross_total),
    vat_total:     Number(r.vat_total),
  }));

  const byStatus: StatusRow[] = (statusRes.data ?? []).map((r: Record<string, unknown>) => ({
    status:        String(r.status),
    invoice_count: Number(r.invoice_count),
    net_total:     Number(r.net_total),
    gross_total:   Number(r.gross_total),
  }));

  const raw = kpiRes.data?.[0] ?? {};
  const kpi: KpiSummary = {
    total_invoices:     Number(raw.total_invoices     ?? 0),
    total_net:          Number(raw.total_net          ?? 0),
    total_gross:        Number(raw.total_gross        ?? 0),
    total_vat:          Number(raw.total_vat          ?? 0),
    accepted_count:     Number(raw.accepted_count     ?? 0),
    rejected_count:     Number(raw.rejected_count     ?? 0),
    pending_ksef_count: Number(raw.pending_ksef_count ?? 0),
  };

  return { monthly, byStatus, kpi };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function InvoiceAnalyticsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; status?: string };
}) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userRecord } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!userRecord?.company_id) redirect('/onboarding');
  if (!canAccessInvoicing(userRecord.role as AppRole)) redirect('/dashboard');

  const from = parseDate(searchParams.from);
  const to   = parseDate(searchParams.to);

  const { monthly, byStatus, kpi } = await fetchAnalytics(userRecord.company_id, from, to);

  return (
    <Stack gap="6" className="max-w-7xl">
      <div>
        <Link
          href="/admin/invoices"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Wróć do listy faktur
        </Link>
        <PageHeader
          title="Analityka faktur"
          description="Przegląd wystawionych faktur — trendy miesięczne, statusy i eksport danych."
        />
      </div>

      <Suspense fallback={<AnalyticsSkeleton />}>
        <InvoiceAnalyticsDashboard
          monthly={monthly}
          byStatus={byStatus}
          kpi={kpi}
          initialFrom={from ?? ''}
          initialTo={to ?? ''}
          companyId={userRecord.company_id}
        />
      </Suspense>
    </Stack>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <div className="grid md:grid-cols-2 gap-4">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
