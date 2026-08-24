import { getSupabaseServerClient } from '@/lib/supabase/server';
import { PlatformInvoicesClient } from '@/components/admin/platform-invoices-client';

export const dynamic = 'force-dynamic';

export default async function PlatformInvoicesPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <PlatformInvoicesClient initialInvoices={[]} initialTotal={0} isOwner={false} />;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: u } = await (supabase as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const isOwner = u?.role === 'owner';

  if (!isOwner) {
    return <PlatformInvoicesClient initialInvoices={[]} initialTotal={0} isOwner={false} />;
  }

  // Fetch initial invoices
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoices, count } = await (supabase as any)
    .from('platform_invoices')
    .select(`
      id, invoice_number, entity_id, status, period_start, period_end,
      subtotal_cents, tax_cents, total_cents, currency,
      issued_at, due_date, sent_at, notes, internal_reference, created_at,
      companies:entity_id ( name )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(50);

  const formatted = (invoices ?? []).map((inv: {
    id: string; invoice_number: string | null; entity_id: string; status: string;
    period_start: string; period_end: string; subtotal_cents: number; tax_cents: number;
    total_cents: number; currency: string; issued_at: string | null; due_date: string | null;
    sent_at: string | null; notes: string | null; internal_reference: string | null;
    created_at: string; companies: { name: string } | { name: string }[] | null;
  }) => ({
    id:                inv.id,
    invoiceNumber:     inv.invoice_number,
    entityId:          inv.entity_id,
    status:            inv.status,
    periodStart:       inv.period_start,
    periodEnd:         inv.period_end,
    subtotalCents:     inv.subtotal_cents,
    taxCents:          inv.tax_cents,
    totalCents:        inv.total_cents,
    currency:          inv.currency,
    issuedAt:          inv.issued_at,
    dueDate:           inv.due_date,
    sentAt:            inv.sent_at,
    notes:             inv.notes,
    internalReference: inv.internal_reference,
    createdAt:         inv.created_at,
    companyName:       Array.isArray(inv.companies) ? inv.companies[0]?.name : inv.companies?.name ?? null,
    companyEmail:      null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-200">Faktury platformowe</h1>
        <p className="text-sm text-slate-500 mt-1">Wystawione faktury za użytkowanie platformy.</p>
      </div>
      <PlatformInvoicesClient initialInvoices={formatted} initialTotal={count ?? 0} isOwner />
    </div>
  );
}
