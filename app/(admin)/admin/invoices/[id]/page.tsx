import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { pl } from 'date-fns/locale';
import { ArrowLeft, Building2, Calendar, CreditCard, FileText, Hash, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, Circle as XCircle, Loader, Ban, Receipt, Download } from 'lucide-react';
import { KsefPanel } from '@/components/admin/ksef-panel';
import { canWriteInvoice, canSendToKsef, type AppRole } from '@/lib/permissions';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { IssuedInvoiceWithItems } from '@/types/issued-invoice';
import {
  STATUS_LABELS,
  type IssuedInvoiceStatus,
  type KsefStatus,
  type VatRate,
} from '@/types/issued-invoice';

export const metadata = { title: 'Admin — Szczegóły faktury' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null, withYear = true) {
  if (!d) return '—';
  try {
    return format(parseISO(d), withYear ? 'dd.MM.yyyy' : 'dd MMM', { locale: pl });
  } catch {
    return d;
  }
}

function fmtDateTime(d: string | null) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd.MM.yyyy HH:mm', { locale: pl }); } catch { return d; }
}

function fmtCurrency(n: number, currency = 'PLN') {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(n);
}

const STATUS_ICON: Record<IssuedInvoiceStatus, React.ElementType> = {
  draft:        FileText,
  issued:       Receipt,
  sent_to_ksef: Loader,
  accepted:     CheckCircle2,
  rejected:     XCircle,
  cancelled:    Ban,
};

const STATUS_COLOR: Record<IssuedInvoiceStatus, string> = {
  draft:        'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  issued:       'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  sent_to_ksef: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  accepted:     'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  rejected:     'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  cancelled:    'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700',
};


const VAT_LABELS: Record<VatRate, string> = {
  '23': '23%',
  '8':  '8%',
  '5':  '5%',
  '0':  '0%',
  'zw': 'zw.',
  'np': 'n.p.',
  'oo': 'o.o.',
};

// ─── Section card ─────────────────────────────────────────────────────────────

function Card({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden', className)}>
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
        <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function DL({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">{label}</dt>
          <dd className="text-sm text-slate-800 dark:text-slate-200 break-words">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function fetchInvoice(id: string): Promise<IssuedInvoiceWithItems | null> {
  const supabase = await getSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice, error } = await (supabase as any)
    .from('issued_invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !invoice) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items } = await (supabase as any)
    .from('issued_invoice_items')
    .select('*')
    .eq('invoice_id', id)
    .order('position', { ascending: true });

  return { ...invoice, items: items ?? [] };
}

export default async function AdminInvoiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const invoice = await fetchInvoice(params.id);
  if (!invoice) notFound();

  // Resolve current user's role for permission-gated UI
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: userRecord } = user
    ? await supabase.from('users').select('role').eq('id', user!.id).maybeSingle()
    : { data: null };
  const role = (userRecord?.role ?? 'member') as AppRole;

  const status = invoice.status as IssuedInvoiceStatus;
  const ksefStatus = invoice.ksef_status as KsefStatus | null;
  const StatusIcon = STATUS_ICON[status];

  return (
    <div className="max-w-5xl space-y-6">
      {/* Back + header */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/admin/invoices"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Wróć do listy
        </Link>
        {invoice.status === 'draft' && canWriteInvoice(role) && (
          <Link
            href={`/admin/invoices/${invoice.id}/edit`}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Edytuj szkic
          </Link>
        )}
      </div>

      {/* Title row */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {invoice.invoice_number}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Wystawiona {fmtDate(invoice.issue_date)} &middot; {invoice.currency}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <Badge variant="outline" className={cn('gap-1.5 px-3 py-1 text-xs font-semibold', STATUS_COLOR[status])}>
            <StatusIcon className="w-3.5 h-3.5" />
            {STATUS_LABELS[status]}
          </Badge>
          {invoice.gross_total !== undefined && (
            <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              {fmtCurrency(invoice.gross_total, invoice.currency)}
            </span>
          )}
          <a
            href={`/api/issued-invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Pobierz PDF
          </a>
        </div>
      </div>

      {/* Parties */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Seller */}
        <Card title="Sprzedawca" icon={Building2}>
          <DL rows={[
            ['Nazwa',   invoice.seller_name],
            ['NIP',     <span key="nip" className="font-mono">{invoice.seller_nip}</span>],
            ['Adres',   invoice.seller_address],
            ['Konto bankowe', invoice.seller_bank_account ?? '—'],
          ]} />
        </Card>

        {/* Buyer */}
        <Card title="Nabywca" icon={Building2}>
          <DL rows={[
            ['Nazwa',   invoice.buyer_name],
            ['NIP',     invoice.buyer_nip
              ? <span key="nip" className="font-mono">{invoice.buyer_nip}</span>
              : '—'],
            ['Adres',   invoice.buyer_address || '—'],
            ['E-mail',  invoice.buyer_email ?? '—'],
          ]} />
        </Card>
      </div>

      {/* Dates + payment */}
      <Card title="Daty i płatność" icon={Calendar}>
        <DL rows={[
          ['Data wystawienia',  fmtDate(invoice.issue_date)],
          ['Data sprzedaży',    fmtDate(invoice.sale_date)],
          ['Termin płatności',  fmtDate(invoice.due_date)],
          ['Forma płatności',   PAYMENT_LABELS[invoice.payment_method as keyof typeof PAYMENT_LABELS] ?? invoice.payment_method],
        ]} />
      </Card>

      {/* Line items */}
      <Card title="Pozycje faktury" icon={Hash}>
        {invoice.items.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Brak pozycji</p>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  {['Lp.', 'Nazwa', 'Jedn.', 'Ilość', 'Cena netto', 'Stawka VAT', 'Netto', 'VAT', 'Brutto'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50/50 dark:bg-slate-800/30 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, i) => (
                  <tr
                    key={item.id}
                    className={cn(
                      'transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30',
                      i < invoice.items.length - 1 && 'border-b border-slate-100 dark:border-slate-800'
                    )}
                  >
                    <td className="px-4 py-3 text-slate-400 tabular-nums">{item.position}</td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-medium max-w-xs">
                      <p className="truncate">{item.name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{item.unit}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 tabular-nums text-right">
                      {new Intl.NumberFormat('pl-PL').format(item.quantity)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 tabular-nums text-right whitespace-nowrap">
                      {fmtCurrency(item.unit_price_net, invoice.currency)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className="text-xs font-mono">
                        {VAT_LABELS[item.vat_rate as VatRate] ?? item.vat_rate}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 tabular-nums text-right whitespace-nowrap">
                      {fmtCurrency(item.net_amount, invoice.currency)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums text-right whitespace-nowrap">
                      {fmtCurrency(item.vat_amount, invoice.currency)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 tabular-nums text-right whitespace-nowrap">
                      {fmtCurrency(item.gross_amount, invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 dark:border-slate-700">
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">
                    Suma
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums text-right whitespace-nowrap">
                    {fmtCurrency(invoice.net_total, invoice.currency)}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-400 tabular-nums text-right whitespace-nowrap">
                    {fmtCurrency(invoice.vat_total, invoice.currency)}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-900 dark:text-white tabular-nums text-right whitespace-nowrap">
                    {fmtCurrency(invoice.gross_total, invoice.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* KSeF section */}
      <Card title="Status KSeF" icon={CreditCard}>
        <KsefPanel
          invoiceId={invoice.id}
          invoiceStatus={status}
          ksefStatus={ksefStatus}
          ksefReferenceNo={invoice.ksef_reference_no ?? null}
          ksefSentAt={invoice.ksef_sent_at ?? null}
          ksefAcceptedAt={invoice.ksef_accepted_at ?? null}
          ksefErrorMessage={invoice.ksef_error_message ?? null}
          canSendToKsef={canSendToKsef(role)}
        />
      </Card>

      {/* Notes */}
      {invoice.notes && (
        <Card title="Uwagi" icon={FileText}>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
            {invoice.notes}
          </p>
        </Card>
      )}
    </div>
  );
}

const PAYMENT_LABELS = {
  transfer: 'Przelew bankowy',
  cash:     'Gotówka',
  card:     'Karta płatnicza',
  other:    'Inne',
};
