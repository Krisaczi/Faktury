import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { parseXmlInvoices } from '@/lib/parsers/xml-invoice-parser';
import type { ParsedParty } from '@/lib/parsers/xml-invoice-parser';
import { format, parseISO } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd MMM yyyy'); } catch { return d; }
}

function fmtAmount(n: number | null | undefined, currency = 'PLN'): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function partyLines(p: ParsedParty | null | undefined, fallbackNip?: string | null): string {
  if (!p && !fallbackNip) return '<span class="empty">—</span>';

  const lines: string[] = [];

  const name = p?.name;
  const nip  = p?.nip ?? fallbackNip;

  if (name) lines.push(`<div class="party-name">${esc(name)}</div>`);
  if (nip)  lines.push(`<div class="party-nip">NIP: <span class="mono">${esc(nip)}</span></div>`);

  const addrParts = [p?.street, [p?.postalCode, p?.city].filter(Boolean).join(' '), p?.country].filter(Boolean);
  if (addrParts.length) lines.push(`<div class="party-addr">${addrParts.map(esc).join('<br/>')}</div>`);

  if (p?.iban) lines.push(`<div class="party-iban">IBAN: <span class="mono">${esc(p.iban)}</span></div>`);
  if (p?.email) lines.push(`<div class="party-contact">${esc(p.email)}</div>`);
  if (p?.phone) lines.push(`<div class="party-contact">${esc(p.phone)}</div>`);

  return lines.join('') || '<span class="empty">—</span>';
}

// ─── HTML template ────────────────────────────────────────────────────────────

function buildHtml(
  invoice: Record<string, unknown>,
  vendor: Record<string, unknown> | null,
  xmlSeller: ParsedParty | null,
  xmlBuyer: ParsedParty | null,
  autoPrint: boolean,
): string {
  const cur = (invoice.currency as string | null) ?? 'PLN';
  const netAmount = (invoice.amount as number | null) ?? (invoice.total_amount as number | null);
  const taxAmount = invoice.tax_amount as number | null;
  const gross = netAmount != null && taxAmount != null ? netAmount + taxAmount : netAmount;

  // Merge DB vendor record into seller party
  const seller: ParsedParty = {
    name: xmlSeller?.name ?? (vendor?.name as string | undefined),
    nip:  xmlSeller?.nip  ?? (invoice.seller_nip as string | undefined),
    street:     xmlSeller?.street,
    postalCode: xmlSeller?.postalCode,
    city:       xmlSeller?.city,
    country:    xmlSeller?.country,
    iban:       xmlSeller?.iban ?? (invoice.bank_account as string | undefined),
    email:      xmlSeller?.email ?? (vendor?.contact_email as string | undefined),
    phone:      xmlSeller?.phone,
  };

  const buyer: ParsedParty | null = xmlBuyer ?? (invoice.buyer_nip ? { nip: invoice.buyer_nip as string } : null);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Invoice ${esc(invoice.invoice_number as string)} – ${esc(seller.name ?? '')}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 13px;
      color: #1e293b;
      background: #fff;
      padding: 40px 48px;
      max-width: 860px;
      margin: 0 auto;
      line-height: 1.5;
    }

    /* ── Print toolbar ── */
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
      box-shadow: 0 2px 8px rgba(0,0,0,.3);
    }
    .print-bar .bar-title { font-size: 13px; font-weight: 500; }
    .print-bar button {
      padding: 6px 16px; border-radius: 6px; border: none;
      cursor: pointer; font-size: 13px; font-weight: 600;
    }
    .btn-print { background: #2563eb; color: #fff; }
    .btn-print:hover { background: #1d4ed8; }
    .btn-close  { background: #334155; color: #e2e8f0; }
    .btn-close:hover { background: #475569; }
    @media screen { body { padding-top: 72px; } }
    @media print  { .print-bar { display: none; } }

    /* ── Document header ── */
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-bottom: 20px;
      margin-bottom: 28px;
      border-bottom: 2px solid #0f172a;
    }
    .doc-header h1 {
      font-size: 26px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
    }
    .doc-header .inv-meta {
      text-align: right;
      font-size: 12px;
      color: #64748b;
      line-height: 1.8;
    }
    .doc-header .inv-meta strong {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      display: block;
    }

    /* ── Parties ── */
    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 28px;
    }
    .party-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px 18px;
      background: #f8fafc;
    }
    .party-box h3 {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: #94a3b8;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e2e8f0;
    }
    .party-name {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .party-nip {
      font-size: 12px;
      color: #475569;
      margin-bottom: 6px;
    }
    .party-addr {
      font-size: 12px;
      color: #64748b;
      line-height: 1.6;
      margin-bottom: 6px;
    }
    .party-iban {
      font-size: 11px;
      color: #475569;
      margin-bottom: 4px;
      word-break: break-all;
    }
    .party-contact {
      font-size: 11px;
      color: #64748b;
    }
    .empty { color: #cbd5e1; }
    .mono  { font-family: 'Courier New', monospace; }

    /* ── Dates grid ── */
    .dates-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
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
      margin-bottom: 4px;
    }
    .date-cell .dc-value {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
    }

    /* ── Section title ── */
    .section-title {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: #94a3b8;
      margin-bottom: 10px;
    }

    /* ── Totals ── */
    .totals-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 28px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 11px 18px;
      font-size: 13px;
      color: #475569;
      border-bottom: 1px solid #f1f5f9;
    }
    .totals-row:last-child { border-bottom: none; }
    .totals-row .tl { color: #64748b; }
    .totals-row .tv { font-variant-numeric: tabular-nums; font-weight: 500; }
    .totals-row.gross {
      background: #f8fafc;
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
    }
    .totals-row.gross .tl { color: #334155; }

    /* ── Payment info ── */
    .payment-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 28px;
    }
    .payment-row {
      display: flex;
      gap: 8px;
      align-items: baseline;
      margin-bottom: 5px;
      font-size: 12px;
    }
    .payment-row:last-child { margin-bottom: 0; }
    .payment-row .pl {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #3b82f6;
      white-space: nowrap;
      width: 100px;
      flex-shrink: 0;
    }
    .payment-row .pv {
      font-family: 'Courier New', monospace;
      color: #1e3a8a;
      font-weight: 500;
      word-break: break-all;
    }

    /* ── Detail table ── */
    table.detail {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    table.detail tbody td {
      padding: 8px 10px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 12px;
      color: #334155;
      vertical-align: top;
    }
    table.detail tbody tr:last-child td { border-bottom: none; }
    table.detail td.dl { color: #94a3b8; width: 160px; white-space: nowrap; }
    table.detail td.dv-mono { font-family: 'Courier New', monospace; }

    /* ── Footer ── */
    .doc-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 14px;
      margin-top: 8px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #cbd5e1;
    }

    /* ── Print ── */
    @media print {
      body { padding: 0; }
      @page { margin: 16mm 14mm; size: A4 portrait; }
    }
  </style>
</head>
<body>

  <!-- Toolbar (screen only) -->
  <div class="print-bar">
    <span class="bar-title">Invoice ${esc(invoice.invoice_number as string ?? '')} &nbsp;·&nbsp; ${esc(seller.name ?? '')}</span>
    <div style="display:flex;gap:8px">
      <button class="btn-print" onclick="window.print()">Save as PDF / Print</button>
      <button class="btn-close" onclick="window.close()">Close</button>
    </div>
  </div>

  <!-- Document header -->
  <div class="doc-header">
    <h1>Invoice</h1>
    <div class="inv-meta">
      <strong>${esc(invoice.invoice_number as string ?? 'No number')}</strong>
      ${invoice.issue_date || invoice.invoice_date
        ? `Issued: ${fmt((invoice.issue_date ?? invoice.invoice_date) as string)}`
        : ''}
      ${invoice.due_date ? `<br/>Due: ${fmt(invoice.due_date as string)}` : ''}
    </div>
  </div>

  <!-- Parties -->
  <div class="parties">
    <div class="party-box">
      <h3>Seller</h3>
      ${partyLines(seller)}
    </div>
    <div class="party-box">
      <h3>Buyer</h3>
      ${partyLines(buyer, invoice.buyer_nip as string | null)}
    </div>
  </div>

  <!-- Dates -->
  <div class="dates-grid">
    <div class="date-cell">
      <div class="dc-label">Issue Date</div>
      <div class="dc-value">${fmt((invoice.issue_date ?? invoice.invoice_date) as string)}</div>
    </div>
    <div class="date-cell">
      <div class="dc-label">Invoice Date</div>
      <div class="dc-value">${fmt((invoice.invoice_date ?? invoice.issue_date) as string)}</div>
    </div>
    <div class="date-cell">
      <div class="dc-label">Due Date</div>
      <div class="dc-value">${fmt(invoice.due_date as string)}</div>
    </div>
  </div>

  <!-- Amounts -->
  <p class="section-title">Amounts</p>
  <div class="totals-box">
    ${netAmount != null
      ? `<div class="totals-row"><span class="tl">Net Amount</span><span class="tv">${esc(fmtAmount(netAmount, cur))}</span></div>`
      : ''}
    ${taxAmount != null
      ? `<div class="totals-row"><span class="tl">VAT / Tax</span><span class="tv">${esc(fmtAmount(taxAmount, cur))}</span></div>`
      : ''}
    ${gross != null
      ? `<div class="totals-row gross"><span class="tl">Total (Gross)</span><span class="tv">${esc(fmtAmount(gross, cur))}</span></div>`
      : ''}
    <div class="totals-row" style="background:#fafafa">
      <span class="tl" style="font-size:10px;text-transform:uppercase;letter-spacing:.06em">Currency</span>
      <span class="tv" style="font-size:11px">${esc(cur)}</span>
    </div>
  </div>

  <!-- Payment -->
  ${(seller.iban || invoice.bank_account || invoice.due_date) ? `
  <p class="section-title">Payment Details</p>
  <div class="payment-box">
    ${(seller.iban || invoice.bank_account)
      ? `<div class="payment-row"><span class="pl">Bank Account</span><span class="pv">${esc((seller.iban ?? invoice.bank_account) as string)}</span></div>`
      : ''}
    ${invoice.due_date
      ? `<div class="payment-row"><span class="pl">Due Date</span><span class="pv">${fmt(invoice.due_date as string)}</span></div>`
      : ''}
  </div>` : ''}

  <!-- Tax IDs -->
  <p class="section-title">Tax Identification</p>
  <table class="detail"><tbody>
    ${seller.nip  ? `<tr><td class="dl">Seller NIP</td><td class="dv-mono">${esc(seller.nip)}</td></tr>` : ''}
    ${(buyer?.nip ?? invoice.buyer_nip)
      ? `<tr><td class="dl">Buyer NIP</td><td class="dv-mono">${esc((buyer?.nip ?? invoice.buyer_nip) as string)}</td></tr>`
      : ''}
    <tr><td class="dl">Currency</td><td>${esc(cur)}</td></tr>
  </tbody></table>

  <!-- Metadata -->
  <p class="section-title">Processing Metadata</p>
  <table class="detail"><tbody>
    <tr><td class="dl">Invoice ID</td><td class="dv-mono" style="font-size:11px">${esc(invoice.id as string)}</td></tr>
    ${invoice.upload_session_id
      ? `<tr><td class="dl">Session ID</td><td class="dv-mono" style="font-size:11px">${esc(invoice.upload_session_id as string)}</td></tr>`
      : ''}
    <tr><td class="dl">Recorded</td><td>${fmt(invoice.created_at as string)}</td></tr>
  </tbody></table>

  <!-- Footer -->
  <div class="doc-footer">
    <span>Generated by InvoiceIQ &nbsp;·&nbsp; ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
    <span>${esc(invoice.invoice_number as string ?? '')}</span>
  </div>

  ${autoPrint ? '<script>window.addEventListener("load",()=>{setTimeout(()=>window.print(),500);});<\/script>' : ''}
</body>
</html>`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new NextResponse('Unauthorized', { status: 401 });

    const autoPrint = req.nextUrl.searchParams.get('print') === '1';

    // Fetch invoice (RLS enforces company scope)
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, issue_date, due_date, amount, total_amount, tax_amount, currency, seller_nip, buyer_nip, bank_account, overall_risk, upload_session_id, created_at, vendor_id, raw_file_url')
      .eq('id', params.id)
      .maybeSingle();

    if (invErr || !invoice) return new NextResponse('Invoice not found', { status: 404 });

    // Fetch vendor record
    let vendor: Record<string, unknown> | null = null;
    if (invoice.vendor_id) {
      const { data: v } = await supabase
        .from('vendors')
        .select('id, name, nip, contact_email, category')
        .eq('id', invoice.vendor_id)
        .maybeSingle();
      vendor = v ?? null;
    }

    // Try to enrich party data from raw XML (best-effort)
    let xmlSeller: ParsedParty | null = null;
    let xmlBuyer: ParsedParty | null = null;

    if (invoice.raw_file_url) {
      try {
        const storagePath = invoice.raw_file_url.includes('/object/sign/')
          ? decodeURIComponent(invoice.raw_file_url.split('/object/sign/invoices/')[1]?.split('?')[0] ?? '')
          : invoice.raw_file_url.replace(/^.*invoices\//, '');

        const { data: urlData } = await supabase.storage
          .from('invoices')
          .createSignedUrl(storagePath, 60);

        if (urlData?.signedUrl) {
          const xmlRes = await fetch(urlData.signedUrl);
          if (xmlRes.ok) {
            const xmlText = await xmlRes.text();
            const parsed = await parseXmlInvoices(xmlText);
            if (parsed.invoices.length > 0) {
              xmlSeller = parsed.invoices[0].seller ?? null;
              xmlBuyer  = parsed.invoices[0].buyer  ?? null;
            }
          }
        }
      } catch {
        // Fall back to DB fields only
      }
    }

    const html = buildHtml(
      invoice as Record<string, unknown>,
      vendor,
      xmlSeller,
      xmlBuyer,
      autoPrint,
    );

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
