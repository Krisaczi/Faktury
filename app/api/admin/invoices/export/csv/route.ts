import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { canAccessInvoicing, type AppRole } from '@/lib/permissions';

/**
 * GET /api/admin/invoices/export/csv
 *
 * Query parameters (all optional):
 *   from     YYYY-MM-DD  — filter issue_date >=
 *   to       YYYY-MM-DD  — filter issue_date <=
 *   status   string      — filter by invoice status
 *
 * Returns a UTF-8 CSV file with BOM so Excel opens it correctly.
 *
 * Columns:
 *   Numer faktury, Status, Status KSeF, Data wystawienia, Data sprzedaży,
 *   Termin płatności, Nabywca, NIP nabywcy, Netto PLN, VAT PLN, Brutto PLN,
 *   Waluta, Numer ref. KSeF, Data wysłania KSeF, Data akceptacji KSeF
 */

function esc(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  // RFC 4180: wrap in double-quotes if the value contains comma, newline, or double-quote
  if (s.includes(',') || s.includes('\n') || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  return d.slice(0, 10);
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '';
  return n.toFixed(2).replace('.', ','); // Polish decimal separator
}

const STATUS_LABELS: Record<string, string> = {
  draft:        'Szkic',
  issued:       'Wystawiona',
  sent_to_ksef: 'Wysłana do KSeF',
  accepted:     'Zaakceptowana',
  rejected:     'Odrzucona',
  cancelled:    'Anulowana',
};

const KSEF_STATUS_LABELS: Record<string, string> = {
  pending:    'Oczekuje',
  processing: 'Przetwarzanie',
  accepted:   'Zaakceptowana',
  rejected:   'Odrzucona',
};

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userRecord } = await supabase
      .from('users')
      .select('role, company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) return NextResponse.json({ error: 'No company' }, { status: 403 });
    if (!canAccessInvoicing(userRecord.role as AppRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from   = searchParams.get('from');
    const to     = searchParams.get('to');
    const status = searchParams.get('status');

    // Build query — fetch all matching rows (no pagination for export)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('issued_invoices')
      .select([
        'invoice_number', 'status', 'ksef_status',
        'issue_date', 'sale_date', 'due_date',
        'buyer_name', 'buyer_nip',
        'net_total', 'vat_total', 'gross_total', 'currency',
        'ksef_reference_no', 'ksef_sent_at', 'ksef_accepted_at',
      ].join(', '))
      .eq('company_id', userRecord.company_id)
      .order('issue_date', { ascending: false });

    if (from)   query = query.gte('issue_date', from);
    if (to)     query = query.lte('issue_date', to);
    if (status) query = query.eq('status', status);

    const { data: rows, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Build CSV
    const headers = [
      'Numer faktury', 'Status', 'Status KSeF',
      'Data wystawienia', 'Data sprzedaży', 'Termin płatności',
      'Nabywca', 'NIP nabywcy',
      'Netto (PLN)', 'VAT (PLN)', 'Brutto (PLN)', 'Waluta',
      'Numer ref. KSeF', 'Data wysłania KSeF', 'Data akceptacji KSeF',
    ];

    const lines: string[] = [headers.map(esc).join(',')];

    for (const r of rows ?? []) {
      lines.push([
        esc(r.invoice_number),
        esc(STATUS_LABELS[r.status]        ?? r.status        ?? ''),
        esc(KSEF_STATUS_LABELS[r.ksef_status] ?? r.ksef_status ?? ''),
        esc(fmtDate(r.issue_date)),
        esc(fmtDate(r.sale_date)),
        esc(fmtDate(r.due_date)),
        esc(r.buyer_name),
        esc(r.buyer_nip),
        esc(fmtNum(r.net_total)),
        esc(fmtNum(r.vat_total)),
        esc(fmtNum(r.gross_total)),
        esc(r.currency ?? 'PLN'),
        esc(r.ksef_reference_no),
        esc(fmtDate(r.ksef_sent_at)),
        esc(fmtDate(r.ksef_accepted_at)),
      ].join(','));
    }

    // UTF-8 BOM + CRLF line endings so Excel auto-detects encoding
    const bom     = '\uFEFF';
    const csv     = bom + lines.join('\r\n');
    const filename = `faktury-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
