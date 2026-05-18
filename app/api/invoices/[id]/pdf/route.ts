import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { format, parseISO } from 'date-fns';

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd MMM yyyy'); } catch { return d; }
}

function fmtAmount(n: number | null | undefined, currency = 'PLN'): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(label: string, value: string | null | undefined, mono = false): string {
  if (!value) return '';
  return `
    <tr>
      <td class="label">${esc(label)}</td>
      <td class="${mono ? 'mono' : ''}">${esc(value)}</td>
    </tr>`;
}

function buildHtml(invoice: Record<string, unknown>, vendor: Record<string, unknown> | null, autoPrint: boolean): string {
  const cur = (invoice.currency as string | null) ?? 'PLN';
  const netAmount = (invoice.amount as number | null) ?? (invoice.total_amount as number | null);
  const taxAmount = invoice.tax_amount as number | null;
  const gross = netAmount != null && taxAmount != null ? netAmount + taxAmount : netAmount;

  const riskColors: Record<string, string> = {
    low: '#16a34a',
    medium: '#d97706',
    high: '#dc2626',
    critical: '#7c3aed',
  };
  const risk = (invoice.overall_risk as string | null) ?? null;
  const riskColor = risk ? (riskColors[risk] ?? '#64748b') : '#64748b';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${esc(invoice.invoice_number as string)} – ${esc(vendor?.name as string ?? '')}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 13px;
      color: #1e293b;
      background: #fff;
      padding: 40px 48px;
      max-width: 860px;
      margin: 0 auto;
    }

    /* ── Header ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 2px solid #e2e8f0;
    }
    .header-left h1 {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.3px;
    }
    .header-left .invoice-no {
      font-size: 13px;
      color: #64748b;
      margin-top: 4px;
    }
    .header-right {
      text-align: right;
    }
    .header-right .logo-placeholder {
      width: 64px;
      height: 64px;
      border-radius: 12px;
      background: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: auto;
      margin-bottom: 8px;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .risk-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border: 1.5px solid currentColor;
    }

    /* ── Parties section ── */
    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 28px;
    }
    .party-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px 20px;
    }
    .party-box h3 {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #94a3b8;
      margin-bottom: 10px;
    }
    .party-box .name {
      font-size: 15px;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .party-box .detail {
      font-size: 12px;
      color: #64748b;
      line-height: 1.6;
    }
    .party-box .nip {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: #475569;
      margin-top: 6px;
    }

    /* ── Dates & payment grid ── */
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 28px;
    }
    .meta-cell {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .meta-cell .cell-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: #94a3b8;
      margin-bottom: 4px;
    }
    .meta-cell .cell-value {
      font-size: 13px;
      font-weight: 500;
      color: #0f172a;
    }

    /* ── Detail tables ── */
    .section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #94a3b8;
      margin-bottom: 8px;
    }
    table.detail {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    table.detail thead th {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: #94a3b8;
      border-bottom: 1.5px solid #e2e8f0;
      padding: 6px 10px;
      text-align: left;
    }
    table.detail tbody td {
      padding: 9px 10px;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
      font-size: 13px;
      vertical-align: top;
    }
    table.detail tbody tr:last-child td { border-bottom: none; }
    table.detail td.label {
      color: #64748b;
      font-size: 12px;
      width: 160px;
      white-space: nowrap;
    }
    table.detail td.mono {
      font-family: 'Courier New', monospace;
      font-size: 12px;
    }

    /* ── Totals block ── */
    .totals {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 28px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 5px 0;
      font-size: 13px;
      color: #475569;
    }
    .totals-row.gross {
      border-top: 1.5px solid #cbd5e1;
      margin-top: 8px;
      padding-top: 12px;
      font-size: 17px;
      font-weight: 700;
      color: #0f172a;
    }
    .totals-row .t-label { color: #64748b; }
    .totals-row .t-value { font-variant-numeric: tabular-nums; }

    /* ── Bank info ── */
    .bank-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 28px;
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
    }
    .bank-box .b-item {}
    .bank-box .b-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: #60a5fa;
      margin-bottom: 3px;
    }
    .bank-box .b-value {
      font-family: 'Courier New', monospace;
      font-size: 13px;
      font-weight: 500;
      color: #1e3a8a;
    }

    /* ── Footer ── */
    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #94a3b8;
      font-size: 11px;
    }

    /* ── Print styles ── */
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
      @page { margin: 18mm 16mm; size: A4 portrait; }
    }

    /* ── Print toolbar (screen only) ── */
    .print-bar {
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
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .print-bar .bar-title { font-size: 13px; font-weight: 500; }
    .print-bar button {
      padding: 6px 16px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }
    .print-bar .btn-print { background: #2563eb; color: #fff; }
    .print-bar .btn-print:hover { background: #1d4ed8; }
    .print-bar .btn-close { background: #334155; color: #e2e8f0; }
    .print-bar .btn-close:hover { background: #475569; }
    @media print { .print-bar { display: none; } }

    /* Push content below fixed bar on screen */
    @media screen { body { padding-top: 72px; } }
  </style>
</head>
<body>
  <div class="print-bar no-print">
    <span class="bar-title">Invoice ${esc(invoice.invoice_number as string ?? '')} &nbsp;·&nbsp; ${esc(vendor?.name as string ?? '')}</span>
    <div style="display:flex;gap:8px;">
      <button class="btn-print" onclick="window.print()">Save as PDF / Print</button>
      <button class="btn-close" onclick="window.close()">Close</button>
    </div>
  </div>

  <!-- ── Header ── -->
  <div class="header">
    <div class="header-left">
      <h1>Invoice</h1>
      <div class="invoice-no">${esc(invoice.invoice_number as string ?? 'No number')}</div>
    </div>
    <div class="header-right">
      <div class="logo-placeholder">LOGO</div>
      ${risk ? `<span class="risk-badge" style="color:${riskColor};border-color:${riskColor}">${esc(risk.toUpperCase())} RISK</span>` : ''}
    </div>
  </div>

  <!-- ── Parties ── -->
  <div class="parties">
    <div class="party-box">
      <h3>Seller (Vendor)</h3>
      <div class="name">${esc(vendor?.name as string ?? invoice.seller_nip as string ?? '—')}</div>
      ${invoice.seller_nip ? `<div class="nip">NIP: ${esc(invoice.seller_nip as string)}</div>` : ''}
    </div>
    <div class="party-box">
      <h3>Buyer</h3>
      <div class="name">${invoice.buyer_nip ? `NIP: ${esc(invoice.buyer_nip as string)}` : '—'}</div>
    </div>
  </div>

  <!-- ── Dates ── -->
  <div class="meta-grid">
    <div class="meta-cell">
      <div class="cell-label">Issue Date</div>
      <div class="cell-value">${fmt(invoice.issue_date as string ?? invoice.invoice_date as string)}</div>
    </div>
    <div class="meta-cell">
      <div class="cell-label">Invoice Date</div>
      <div class="cell-value">${fmt(invoice.invoice_date as string ?? invoice.issue_date as string)}</div>
    </div>
    <div class="meta-cell">
      <div class="cell-label">Due Date</div>
      <div class="cell-value">${fmt(invoice.due_date as string)}</div>
    </div>
  </div>

  <!-- ── Totals ── -->
  <p class="section-title">Amounts</p>
  <div class="totals">
    ${netAmount != null ? `<div class="totals-row"><span class="t-label">Net Amount</span><span class="t-value">${esc(fmtAmount(netAmount, cur))}</span></div>` : ''}
    ${taxAmount != null ? `<div class="totals-row"><span class="t-label">VAT / Tax</span><span class="t-value">${esc(fmtAmount(taxAmount, cur))}</span></div>` : ''}
    ${gross != null ? `<div class="totals-row gross"><span class="t-label">Total (Gross)</span><span class="t-value">${esc(fmtAmount(gross, cur))}</span></div>` : ''}
    <div class="totals-row" style="margin-top:6px"><span class="t-label" style="font-size:11px">Currency</span><span class="t-value" style="font-size:11px">${esc(cur)}</span></div>
  </div>

  <!-- ── Bank ── -->
  ${(invoice.bank_account || invoice.due_date) ? `
  <p class="section-title">Payment</p>
  <div class="bank-box">
    ${invoice.bank_account ? `<div class="b-item"><div class="b-label">Bank Account</div><div class="b-value">${esc(invoice.bank_account as string)}</div></div>` : ''}
    ${invoice.due_date ? `<div class="b-item"><div class="b-label">Payment Due</div><div class="b-value">${fmt(invoice.due_date as string)}</div></div>` : ''}
  </div>` : ''}

  <!-- ── Tax IDs ── -->
  <p class="section-title">Tax Identification</p>
  <table class="detail">
    <tbody>
      ${row('Seller NIP', invoice.seller_nip as string, true)}
      ${row('Buyer NIP', invoice.buyer_nip as string, true)}
      ${row('Currency', invoice.currency as string)}
    </tbody>
  </table>

  <!-- ── Source metadata ── -->
  <p class="section-title">Processing Metadata</p>
  <table class="detail">
    <tbody>
      ${row('Invoice ID', invoice.id as string, true)}
      ${row('Upload Session', invoice.upload_session_id as string, true)}
      ${row('Recorded At', invoice.created_at ? fmt(invoice.created_at as string) : null)}
    </tbody>
  </table>

  <!-- ── Footer ── -->
  <div class="footer">
    <span>Generated by InvoiceIQ &nbsp;·&nbsp; ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
    <span>${esc(invoice.invoice_number as string ?? '')}</span>
  </div>

  ${autoPrint ? '<script>window.addEventListener("load", () => { setTimeout(() => window.print(), 400); });</script>' : ''}
</body>
</html>`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const autoPrint = req.nextUrl.searchParams.get('print') === '1';

    // Fetch invoice (RLS enforces company scope)
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, issue_date, due_date, amount, total_amount, tax_amount, currency, seller_nip, buyer_nip, bank_account, overall_risk, upload_session_id, created_at, vendor_id')
      .eq('id', params.id)
      .maybeSingle();

    if (invErr || !invoice) {
      return new NextResponse('Invoice not found', { status: 404 });
    }

    // Fetch vendor
    let vendor: Record<string, unknown> | null = null;
    if (invoice.vendor_id) {
      const { data: v } = await supabase
        .from('vendors')
        .select('id, name, nip, contact_email, category')
        .eq('id', invoice.vendor_id)
        .maybeSingle();
      vendor = v ?? null;
    }

    const html = buildHtml(invoice as Record<string, unknown>, vendor, autoPrint);

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-cache',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    });
  } catch (err) {
    console.error('[api/invoices/[id]/pdf]', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
