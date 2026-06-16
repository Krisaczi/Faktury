import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { format, parseISO } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { IssuedInvoiceWithItems } from '@/types/issued-invoice';
import { VAT_RATES, type VatRate } from '@/types/issued-invoice';
import { requireInvoicingEnabled } from '@/lib/packages/get-company-package';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd.MM.yyyy', { locale: pl }); } catch { return d; }
}

function fmtAmount(n: number | null | undefined, currency = 'PLN'): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PAYMENT_LABELS: Record<string, string> = {
  transfer: 'Przelew bankowy',
  cash:     'Gotówka',
  card:     'Karta płatnicza',
  other:    'Inne',
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

// ─── VAT breakdown ────────────────────────────────────────────────────────────

interface VatGroup {
  rate:       VatRate;
  net_total:  number;
  vat_total:  number;
  gross_total: number;
}

function buildVatGroups(items: IssuedInvoiceWithItems['items']): VatGroup[] {
  const map = new Map<VatRate, VatGroup>();
  for (const item of items) {
    const rate = item.vat_rate as VatRate;
    const existing = map.get(rate);
    if (existing) {
      existing.net_total   += item.net_amount;
      existing.vat_total   += item.vat_amount;
      existing.gross_total += item.gross_amount;
    } else {
      map.set(rate, {
        rate,
        net_total:   item.net_amount,
        vat_total:   item.vat_amount,
        gross_total: item.gross_amount,
      });
    }
  }
  // Order by VAT_RATES canonical order
  return VAT_RATES
    .map(r => map.get(r))
    .filter((g): g is VatGroup => g !== undefined);
}

// ─── HTML template ────────────────────────────────────────────────────────────

function buildHtml(invoice: IssuedInvoiceWithItems): string {
  const cur = invoice.currency ?? 'PLN';
  const vatGroups = buildVatGroups(invoice.items);
  const generatedAt = format(new Date(), 'dd.MM.yyyy HH:mm', { locale: pl });

  const itemRows = invoice.items.map((item, i) => `
    <tr class="${i % 2 === 1 ? 'alt' : ''}">
      <td class="center">${item.position}</td>
      <td>${esc(item.name)}</td>
      <td class="center">${esc(item.unit)}</td>
      <td class="right">${fmtNum(item.quantity)}</td>
      <td class="right mono">${fmtNum(item.unit_price_net)}</td>
      <td class="center">${VAT_LABELS[item.vat_rate as VatRate] ?? esc(item.vat_rate)}</td>
      ${item.discount_pct ? `<td class="right">${fmtNum(item.discount_pct)}%</td>` : '<td class="center muted">—</td>'}
      <td class="right mono">${fmtNum(item.net_amount)}</td>
      <td class="right mono">${fmtNum(item.vat_amount)}</td>
      <td class="right mono bold">${fmtNum(item.gross_amount)}</td>
    </tr>`).join('');

  const vatGroupRows = vatGroups.map(g => `
    <tr>
      <td>${VAT_LABELS[g.rate]}</td>
      <td class="right mono">${fmtNum(g.net_total)}</td>
      <td class="right mono">${fmtNum(g.vat_total)}</td>
      <td class="right mono bold">${fmtNum(g.gross_total)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Faktura ${esc(invoice.invoice_number)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 12px;
      color: #1e293b;
      background: #fff;
      line-height: 1.5;
    }

    .page {
      max-width: 860px;
      margin: 0 auto;
      padding: 48px 52px;
    }

    /* ── Print toolbar (screen only) ── */
    .toolbar {
      position: fixed;
      top: 0; left: 0; right: 0;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 24px;
      z-index: 9999;
      gap: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,.35);
    }
    .toolbar-title { font-size: 13px; font-weight: 600; }
    .toolbar-actions { display: flex; gap: 8px; }
    .toolbar button {
      padding: 6px 18px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }
    .btn-pdf  { background: #2563eb; color: #fff; }
    .btn-pdf:hover { background: #1d4ed8; }
    .btn-close { background: #334155; color: #e2e8f0; }
    .btn-close:hover { background: #475569; }
    @media screen { .page { padding-top: 80px; } }
    @media print  { .toolbar { display: none; } .page { padding-top: 48px; } }

    /* ── Document header ── */
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 24px;
      margin-bottom: 32px;
      border-bottom: 2.5px solid #0f172a;
    }
    .doc-title {
      font-size: 28px;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -0.5px;
      line-height: 1;
    }
    .doc-subtitle {
      font-size: 13px;
      color: #64748b;
      margin-top: 6px;
    }
    .doc-number-block {
      text-align: right;
    }
    .doc-number {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      font-family: 'Courier New', monospace;
    }
    .doc-number-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: #94a3b8;
      margin-bottom: 4px;
    }
    .doc-meta {
      margin-top: 8px;
      font-size: 11px;
      color: #64748b;
      text-align: right;
      line-height: 1.8;
    }

    /* ── Status badge ── */
    .status-badge {
      display: inline-block;
      margin-top: 6px;
      padding: 3px 10px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .05em;
      border: 1px solid;
    }
    .status-issued     { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
    .status-draft      { background: #f8fafc; color: #64748b; border-color: #e2e8f0; }
    .status-sent_to_ksef { background: #fffbeb; color: #b45309; border-color: #fde68a; }
    .status-accepted   { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
    .status-rejected   { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
    .status-cancelled  { background: #f8fafc; color: #94a3b8; border-color: #e2e8f0; }

    /* ── Parties grid ── */
    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 28px;
    }
    .party-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    .party-box-head {
      background: #f8fafc;
      padding: 8px 14px;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: #94a3b8;
      border-bottom: 1px solid #e2e8f0;
    }
    .party-box-body {
      padding: 14px;
    }
    .party-name {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 5px;
    }
    .party-row {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 3px;
      line-height: 1.5;
    }
    .party-row .label {
      font-weight: 600;
      color: #94a3b8;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: .06em;
    }
    .mono { font-family: 'Courier New', monospace; }

    /* ── Dates strip ── */
    .dates-strip {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 28px;
    }
    .date-cell {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .date-cell .dc-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #94a3b8;
      margin-bottom: 5px;
    }
    .date-cell .dc-value {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
    }

    /* ── Section heading ── */
    .section-heading {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: #94a3b8;
      margin-bottom: 10px;
    }

    /* ── Items table ── */
    table.items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 11px;
    }
    table.items-table thead tr {
      background: #f8fafc;
      border-bottom: 1.5px solid #e2e8f0;
    }
    table.items-table thead th {
      padding: 8px 10px;
      text-align: left;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #94a3b8;
      white-space: nowrap;
    }
    table.items-table thead th.right { text-align: right; }
    table.items-table thead th.center { text-align: center; }
    table.items-table tbody tr {
      border-bottom: 1px solid #f1f5f9;
    }
    table.items-table tbody tr.alt { background: #fafafa; }
    table.items-table tbody tr:last-child { border-bottom: none; }
    table.items-table tbody td {
      padding: 8px 10px;
      color: #334155;
      vertical-align: middle;
    }
    table.items-table tbody td.right  { text-align: right; white-space: nowrap; }
    table.items-table tbody td.center { text-align: center; }
    table.items-table tbody td.muted  { color: #cbd5e1; }
    table.items-table tfoot tr {
      background: #f8fafc;
      border-top: 2px solid #0f172a;
    }
    table.items-table tfoot td {
      padding: 10px 10px;
      font-size: 11px;
      font-weight: 700;
      text-align: right;
      white-space: nowrap;
      color: #0f172a;
    }
    table.items-table tfoot td.label {
      text-align: right;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #94a3b8;
      font-weight: 700;
    }

    /* ── Summary row ── */
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      margin-bottom: 24px;
      align-items: start;
    }

    /* ── VAT breakdown table ── */
    table.vat-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    table.vat-table thead tr {
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    table.vat-table thead th {
      padding: 8px 12px;
      text-align: right;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #94a3b8;
    }
    table.vat-table thead th:first-child { text-align: left; }
    table.vat-table tbody tr {
      border-bottom: 1px solid #f1f5f9;
    }
    table.vat-table tbody tr:last-child { border-bottom: none; }
    table.vat-table tbody td {
      padding: 8px 12px;
      color: #475569;
    }

    /* ── Totals box ── */
    .totals-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 16px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 12px;
      color: #475569;
    }
    .totals-row:last-child { border-bottom: none; }
    .totals-row .tl { color: #64748b; }
    .totals-row .tv { font-family: 'Courier New', monospace; font-weight: 500; white-space: nowrap; }
    .totals-row.gross-row {
      background: #0f172a;
      padding: 14px 16px;
    }
    .totals-row.gross-row .tl { font-size: 13px; font-weight: 700; color: #94a3b8; }
    .totals-row.gross-row .tv { font-size: 18px; font-weight: 900; color: #fff; }

    /* ── Payment box ── */
    .payment-box {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      padding: 16px 18px;
      margin-bottom: 24px;
    }
    .payment-box .pb-head {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: #0284c7;
      margin-bottom: 10px;
    }
    .payment-row {
      display: flex;
      gap: 12px;
      align-items: baseline;
      margin-bottom: 6px;
      font-size: 11px;
    }
    .payment-row:last-child { margin-bottom: 0; }
    .payment-row .pl {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: #0284c7;
      white-space: nowrap;
      width: 120px;
      flex-shrink: 0;
    }
    .payment-row .pv {
      font-family: 'Courier New', monospace;
      color: #0c4a6e;
      font-weight: 500;
      word-break: break-all;
    }

    /* ── Notes ── */
    .notes-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 16px;
      background: #fafafa;
      margin-bottom: 24px;
    }
    .notes-box p {
      font-size: 11px;
      color: #64748b;
      white-space: pre-wrap;
      line-height: 1.7;
    }

    /* ── Footer ── */
    .doc-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      margin-top: 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: #cbd5e1;
    }
    .doc-footer .inv-num { font-family: 'Courier New', monospace; }

    /* ── Helpers ── */
    .bold  { font-weight: 700; }
    .right { text-align: right; }

    /* ── Print settings ── */
    @media print {
      body { background: #fff; }
      .page { padding: 0; }
      @page { margin: 14mm 12mm; size: A4 portrait; }
    }
  </style>
</head>
<body>

  <!-- Toolbar (screen only) -->
  <div class="toolbar">
    <span class="toolbar-title">Faktura &nbsp;${esc(invoice.invoice_number)} &nbsp;·&nbsp; ${esc(invoice.seller_name)}</span>
    <div class="toolbar-actions">
      <button class="btn-pdf" onclick="window.print()">Drukuj / Zapisz jako PDF</button>
      <button class="btn-close" onclick="history.back()">Zamknij</button>
    </div>
  </div>

  <div class="page">

    <!-- Document header -->
    <div class="doc-header">
      <div>
        <div class="doc-title">FAKTURA VAT</div>
        <div class="doc-subtitle">Dokument wystawiony zgodnie z przepisami ustawy o VAT</div>
      </div>
      <div class="doc-number-block">
        <div class="doc-number-label">Numer faktury</div>
        <div class="doc-number">${esc(invoice.invoice_number)}</div>
        <div class="doc-meta">
          Data wystawienia: ${fmtDate(invoice.issue_date)}<br/>
          ${invoice.due_date ? `Termin płatności: ${fmtDate(invoice.due_date)}<br/>` : ''}
          Waluta: ${esc(cur)}
        </div>
        <span class="status-badge status-${esc(invoice.status)}">
          ${{
            draft:        'Szkic',
            issued:       'Wystawiona',
            sent_to_ksef: 'W KSeF',
            accepted:     'Zaakceptowana',
            rejected:     'Odrzucona',
            cancelled:    'Anulowana',
          }[invoice.status] ?? esc(invoice.status)}
        </span>
      </div>
    </div>

    <!-- Parties -->
    <div class="parties">
      <!-- Seller -->
      <div class="party-box">
        <div class="party-box-head">Sprzedawca (Podmiot 1)</div>
        <div class="party-box-body">
          <div class="party-name">${esc(invoice.seller_name)}</div>
          <div class="party-row"><span class="label">NIP</span>&nbsp; <span class="mono">${esc(invoice.seller_nip)}</span></div>
          ${invoice.seller_address ? `<div class="party-row" style="margin-top:6px">${esc(invoice.seller_address).replace(/\n/g, '<br/>')}</div>` : ''}
          ${invoice.seller_bank_account ? `<div class="party-row" style="margin-top:6px"><span class="label">Nr konta</span>&nbsp; <span class="mono">${esc(invoice.seller_bank_account)}</span></div>` : ''}
        </div>
      </div>

      <!-- Buyer -->
      <div class="party-box">
        <div class="party-box-head">Nabywca (Podmiot 2)</div>
        <div class="party-box-body">
          <div class="party-name">${esc(invoice.buyer_name)}</div>
          ${invoice.buyer_nip ? `<div class="party-row"><span class="label">NIP</span>&nbsp; <span class="mono">${esc(invoice.buyer_nip)}</span></div>` : ''}
          ${invoice.buyer_address ? `<div class="party-row" style="margin-top:6px">${esc(invoice.buyer_address).replace(/\n/g, '<br/>')}</div>` : ''}
          ${invoice.buyer_email ? `<div class="party-row" style="margin-top:4px"><span class="label">E-mail</span>&nbsp; ${esc(invoice.buyer_email)}</div>` : ''}
        </div>
      </div>
    </div>

    <!-- Dates strip -->
    <div class="dates-strip">
      <div class="date-cell">
        <div class="dc-label">Data wystawienia</div>
        <div class="dc-value">${fmtDate(invoice.issue_date)}</div>
      </div>
      <div class="date-cell">
        <div class="dc-label">Data sprzedaży</div>
        <div class="dc-value">${fmtDate(invoice.sale_date)}</div>
      </div>
      <div class="date-cell">
        <div class="dc-label">Termin płatności</div>
        <div class="dc-value">${fmtDate(invoice.due_date)}</div>
      </div>
      <div class="date-cell">
        <div class="dc-label">Forma płatności</div>
        <div class="dc-value">${esc(PAYMENT_LABELS[invoice.payment_method] ?? invoice.payment_method)}</div>
      </div>
    </div>

    <!-- Line items -->
    <p class="section-heading">Pozycje faktury</p>
    <table class="items-table">
      <thead>
        <tr>
          <th class="center" style="width:36px">Lp.</th>
          <th>Nazwa towaru / usługi</th>
          <th class="center">Jedn.</th>
          <th class="right">Ilość</th>
          <th class="right">Cena netto</th>
          <th class="center">VAT</th>
          <th class="right">Rabat</th>
          <th class="right">Netto</th>
          <th class="right">VAT</th>
          <th class="right">Brutto</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
      <tfoot>
        <tr>
          <td class="label" colspan="7">Razem</td>
          <td>${fmtNum(invoice.net_total)}</td>
          <td>${fmtNum(invoice.vat_total)}</td>
          <td>${fmtNum(invoice.gross_total)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Summary: VAT breakdown + totals -->
    <div class="summary-grid">
      <!-- VAT breakdown -->
      <div>
        <p class="section-heading">Zestawienie VAT</p>
        <table class="vat-table">
          <thead>
            <tr>
              <th>Stawka</th>
              <th>Netto</th>
              <th>VAT</th>
              <th>Brutto</th>
            </tr>
          </thead>
          <tbody>
            ${vatGroupRows}
          </tbody>
        </table>
      </div>

      <!-- Totals -->
      <div style="min-width:240px">
        <p class="section-heading">&nbsp;</p>
        <div class="totals-box">
          <div class="totals-row">
            <span class="tl">Suma netto</span>
            <span class="tv">${esc(fmtAmount(invoice.net_total, cur))}</span>
          </div>
          <div class="totals-row">
            <span class="tl">Podatek VAT</span>
            <span class="tv">${esc(fmtAmount(invoice.vat_total, cur))}</span>
          </div>
          <div class="totals-row gross-row">
            <span class="tl">Do zapłaty</span>
            <span class="tv">${esc(fmtAmount(invoice.gross_total, cur))}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Payment details -->
    ${(invoice.seller_bank_account || invoice.due_date) ? `
    <div class="payment-box">
      <div class="pb-head">Szczegóły płatności</div>
      ${invoice.seller_bank_account ? `
      <div class="payment-row">
        <span class="pl">Nr rachunku</span>
        <span class="pv">${esc(invoice.seller_bank_account)}</span>
      </div>` : ''}
      ${invoice.due_date ? `
      <div class="payment-row">
        <span class="pl">Termin</span>
        <span class="pv">${fmtDate(invoice.due_date)}</span>
      </div>` : ''}
      <div class="payment-row">
        <span class="pl">Forma</span>
        <span class="pv">${esc(PAYMENT_LABELS[invoice.payment_method] ?? invoice.payment_method)}</span>
      </div>
      <div class="payment-row">
        <span class="pl">Kwota</span>
        <span class="pv bold">${esc(fmtAmount(invoice.gross_total, cur))}</span>
      </div>
    </div>` : ''}

    <!-- Notes -->
    ${invoice.notes ? `
    <p class="section-heading">Uwagi</p>
    <div class="notes-box">
      <p>${esc(invoice.notes)}</p>
    </div>` : ''}

    <!-- KSeF reference -->
    ${invoice.ksef_reference_no ? `
    <p class="section-heading">KSeF</p>
    <div class="notes-box">
      <div class="payment-row">
        <span class="pl">Nr ref. KSeF</span>
        <span class="pv">${esc(invoice.ksef_reference_no)}</span>
      </div>
    </div>` : ''}

    <!-- Footer -->
    <div class="doc-footer">
      <span>Wygenerowano ${generatedAt}</span>
      <span class="inv-num">${esc(invoice.invoice_number)}</span>
    </div>

  </div><!-- /.page -->
</body>
</html>`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new NextResponse('Unauthorized', { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: u } = await (supabase as any)
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!u?.company_id) return new NextResponse('Forbidden', { status: 403 });

    // Package-level enforcement: invoicing requires Professional plan
    try {
      await requireInvoicingEnabled(u.company_id as string);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Forbidden';
      return new NextResponse(msg, { status: 403 });
    }

    // Fetch invoice header
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invoice, error: invErr } = await (supabase as any)
      .from('issued_invoices')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();

    if (invErr || !invoice) return new NextResponse('Faktura nie istnieje', { status: 404 });

    // Fetch line items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: items } = await (supabase as any)
      .from('issued_invoice_items')
      .select('*')
      .eq('invoice_id', params.id)
      .order('position', { ascending: true });

    const invoiceWithItems: IssuedInvoiceWithItems = {
      ...invoice,
      items: items ?? [],
    };

    const html = buildHtml(invoiceWithItems);

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-cache',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    });
  } catch (err) {
    console.error('[api/issued-invoices/[id]/pdf]', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
