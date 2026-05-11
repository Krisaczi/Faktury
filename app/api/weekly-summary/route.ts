import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';

// ─── Admin client ─────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeeklyMetrics {
  invoices_scanned:    number;
  high_risk_count:     number;
  medium_risk_count:   number;
  low_risk_count:      number;
  flagged_amount:      number;
  top_vendors:         { vendor_name: string; invoice_count: number; high_risk: number }[];
  top_flag_types:      { type: string; count: number }[];
  prev_week_invoices:  number;
  prev_week_high_risk: number;
}

interface CompanyRow {
  id:                  string;
  name:                string;
  currency:            string;
  subscription_status: string;
}

interface UserRow {
  email: string;
}

// ─── Cron secret validation ───────────────────────────────────────────────────

function validateCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured — only allow in non-production environments
    return process.env.NODE_ENV !== 'production';
  }
  const header = req.headers.get('x-cron-secret');
  // Constant-time comparison via Buffer when available
  try {
    const { timingSafeEqual } = require('crypto') as typeof import('crypto');
    return (
      header !== null &&
      header.length === secret.length &&
      timingSafeEqual(Buffer.from(header), Buffer.from(secret))
    );
  } catch {
    return header === secret;
  }
}

// ─── Resend email sender ──────────────────────────────────────────────────────

interface SendResult {
  id?: string;
  error?: string;
}

async function sendEmail(opts: {
  to:      string;
  subject: string;
  html:    string;
  text:    string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: 'RESEND_API_KEY not configured' };

  const fromAddress =
    process.env.RESEND_FROM_EMAIL ?? 'reports@updates.invoiceguard.app';

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from:    fromAddress,
      to:      [opts.to],
      subject: opts.subject,
      html:    opts.html,
      text:    opts.text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    return { error: `Resend error ${res.status}: ${detail.slice(0, 200)}` };
  }

  const json = await res.json() as { id?: string };
  return { id: json.id };
}

// ─── Email template ───────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('pl-PL', {
    style:    'currency',
    currency: currency || 'PLN',
    maximumFractionDigits: 2,
  }).format(amount);
}

function trendBadge(current: number, prev: number): string {
  if (prev === 0) return '';
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct > 0)  return ` <span style="color:#dc2626">(+${pct}%)</span>`;
  if (pct < 0)  return ` <span style="color:#16a34a">(${pct}%)</span>`;
  return ' <span style="color:#6b7280">(0%)</span>';
}

function buildEmailHtml(opts: {
  companyName: string;
  periodFrom:  Date;
  periodTo:    Date;
  metrics:     WeeklyMetrics;
  currency:    string;
}): { html: string; text: string } {
  const { companyName, periodFrom, periodTo, metrics, currency } = opts;

  const fmt   = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const period = `${fmt(periodFrom)} – ${fmt(periodTo)}`;

  const riskColor = (risk: string) =>
    risk === 'high' ? '#dc2626' : risk === 'medium' ? '#d97706' : '#16a34a';

  const topVendorRows = metrics.top_vendors
    .map(
      (v) =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${escapeHtml(v.vendor_name ?? 'Unknown')}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:center">${v.invoice_count}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:center;color:${riskColor('high')};font-weight:600">${v.high_risk}</td>
        </tr>`
    )
    .join('');

  const topFlagRows = metrics.top_flag_types
    .map(
      (f) =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${escapeHtml(humaniseFlag(f.type))}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:center;font-weight:600">${f.count}</td>
        </tr>`
    )
    .join('');

  const invoiceTrend   = trendBadge(metrics.invoices_scanned,  metrics.prev_week_invoices);
  const highRiskTrend  = trendBadge(metrics.high_risk_count,   metrics.prev_week_high_risk);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Weekly Invoice Summary</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">

          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:28px 40px">
              <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.08em;color:#94a3b8;text-transform:uppercase">Weekly Report</p>
              <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#f8fafc">${escapeHtml(companyName)}</h1>
              <p style="margin:6px 0 0;font-size:13px;color:#94a3b8">${period}</p>
            </td>
          </tr>

          <!-- Metric cards -->
          <tr>
            <td style="padding:32px 40px 0">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" style="padding-right:8px">
                    <div style="background:#f8fafc;border-radius:8px;padding:16px;border:1px solid #e2e8f0">
                      <p style="margin:0;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Invoices Scanned</p>
                      <p style="margin:6px 0 0;font-size:28px;font-weight:700;color:#0f172a">${metrics.invoices_scanned}${invoiceTrend}</p>
                    </div>
                  </td>
                  <td width="33%" style="padding:0 4px">
                    <div style="background:#fef2f2;border-radius:8px;padding:16px;border:1px solid #fecaca">
                      <p style="margin:0;font-size:11px;color:#991b1b;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">High Risk</p>
                      <p style="margin:6px 0 0;font-size:28px;font-weight:700;color:#dc2626">${metrics.high_risk_count}${highRiskTrend}</p>
                    </div>
                  </td>
                  <td width="33%" style="padding-left:8px">
                    <div style="background:#fffbeb;border-radius:8px;padding:16px;border:1px solid #fde68a">
                      <p style="margin:0;font-size:11px;color:#92400e;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Flagged Amount</p>
                      <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#d97706">${formatCurrency(metrics.flagged_amount, currency)}</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Risk breakdown -->
          <tr>
            <td style="padding:24px 40px 0">
              <h2 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;padding-bottom:8px">Risk Breakdown</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${buildRiskBar(metrics)}
              </table>
            </td>
          </tr>

          ${topVendorRows ? `
          <!-- Top vendors -->
          <tr>
            <td style="padding:24px 40px 0">
              <h2 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;padding-bottom:8px">Top Flagged Vendors</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
                <thead>
                  <tr style="background:#f8fafc">
                    <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Vendor</th>
                    <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Invoices</th>
                    <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">High Risk</th>
                  </tr>
                </thead>
                <tbody>${topVendorRows}</tbody>
              </table>
            </td>
          </tr>` : ''}

          ${topFlagRows ? `
          <!-- Top flag types -->
          <tr>
            <td style="padding:24px 40px 0">
              <h2 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;padding-bottom:8px">Most Common Risk Flags</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
                <thead>
                  <tr style="background:#f8fafc">
                    <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Flag Type</th>
                    <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Count</th>
                  </tr>
                </thead>
                <tbody>${topFlagRows}</tbody>
              </table>
            </td>
          </tr>` : ''}

          <!-- Footer -->
          <tr>
            <td style="padding:32px 40px;border-top:1px solid #e5e7eb;margin-top:24px">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">
                This report was automatically generated for <strong>${escapeHtml(companyName)}</strong>.<br />
                To manage your notification preferences, visit your account settings.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Plain-text fallback
  const vendorLines = metrics.top_vendors
    .map((v) => `  - ${v.vendor_name ?? 'Unknown'}: ${v.invoice_count} invoices, ${v.high_risk} high-risk`)
    .join('\n');

  const flagLines = metrics.top_flag_types
    .map((f) => `  - ${humaniseFlag(f.type)}: ${f.count}`)
    .join('\n');

  const text = [
    `WEEKLY INVOICE SUMMARY — ${escapeHtml(companyName)}`,
    `Period: ${period}`,
    '',
    `Invoices Scanned : ${metrics.invoices_scanned}`,
    `High Risk        : ${metrics.high_risk_count}`,
    `Medium Risk      : ${metrics.medium_risk_count}`,
    `Low Risk         : ${metrics.low_risk_count}`,
    `Flagged Amount   : ${formatCurrency(metrics.flagged_amount, currency)}`,
    '',
    metrics.top_vendors.length ? `TOP FLAGGED VENDORS\n${vendorLines}` : '',
    '',
    metrics.top_flag_types.length ? `MOST COMMON FLAGS\n${flagLines}` : '',
  ]
    .filter((l) => l !== undefined)
    .join('\n')
    .trim();

  return { html, text };
}

function buildRiskBar(m: WeeklyMetrics): string {
  const total = m.invoices_scanned || 1;
  const pctHigh   = Math.round((m.high_risk_count   / total) * 100);
  const pctMed    = Math.round((m.medium_risk_count  / total) * 100);
  const pctLow    = Math.round((m.low_risk_count     / total) * 100);

  return `
    <tr>
      <td style="padding:4px 0;font-size:13px;color:#374151;width:80px">High</td>
      <td style="padding:4px 8px">
        <div style="background:#fee2e2;border-radius:4px;height:12px;overflow:hidden">
          <div style="background:#dc2626;height:12px;width:${pctHigh}%;border-radius:4px"></div>
        </div>
      </td>
      <td style="padding:4px 0;font-size:13px;color:#dc2626;font-weight:600;width:60px;text-align:right">${m.high_risk_count}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;font-size:13px;color:#374151">Medium</td>
      <td style="padding:4px 8px">
        <div style="background:#fef3c7;border-radius:4px;height:12px;overflow:hidden">
          <div style="background:#d97706;height:12px;width:${pctMed}%;border-radius:4px"></div>
        </div>
      </td>
      <td style="padding:4px 0;font-size:13px;color:#d97706;font-weight:600;text-align:right">${m.medium_risk_count}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;font-size:13px;color:#374151">Low</td>
      <td style="padding:4px 8px">
        <div style="background:#dcfce7;border-radius:4px;height:12px;overflow:hidden">
          <div style="background:#16a34a;height:12px;width:${pctLow}%;border-radius:4px"></div>
        </div>
      </td>
      <td style="padding:4px 0;font-size:13px;color:#16a34a;font-weight:600;text-align:right">${m.low_risk_count}</td>
    </tr>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;');
}

function humaniseFlag(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  if (!validateCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    companyIds?: string[];
    dryRun?:     boolean;
  };

  const dryRun       = body.dryRun === true;
  const filterIds    = Array.isArray(body.companyIds) && body.companyIds.length > 0
    ? body.companyIds
    : null;

  const db         = getAdminClient();
  const periodTo   = new Date();
  const periodFrom = new Date(periodTo.getTime() - 7 * 24 * 60 * 60 * 1000);

  // ── Fetch eligible companies ───────────────────────────────────────────────
  let companiesQuery = db
    .from('companies')
    .select('id, name, currency, subscription_status')
    .in('subscription_status', ['active', 'trial']);

  if (filterIds) {
    companiesQuery = companiesQuery.in('id', filterIds);
  }

  const { data: companies, error: companiesError } = await companiesQuery;

  if (companiesError) {
    console.error('[weekly-summary] Failed to fetch companies:', companiesError.message);
    return NextResponse.json(
      { error: 'Failed to fetch companies', detail: companiesError.message },
      { status: 500 }
    );
  }

  if (!companies || companies.length === 0) {
    return NextResponse.json({ companies_processed: 0, emails_sent: 0, errors: [] });
  }

  // ── Process each company ───────────────────────────────────────────────────
  let emailsSent     = 0;
  const errors: { companyId: string; error: string }[] = [];

  for (const company of companies as CompanyRow[]) {
    try {
      // ── Compute metrics via RPC ──────────────────────────────────────────
      const { data: metricsRaw, error: rpcError } = await (db.rpc as Function)(
        'get_weekly_summary',
        {
          p_company_id: company.id,
          p_from:       periodFrom.toISOString(),
          p_to:         periodTo.toISOString(),
        }
      );

      if (rpcError) {
        errors.push({ companyId: company.id, error: `RPC error: ${rpcError.message}` });
        continue;
      }

      const metrics = metricsRaw as unknown as WeeklyMetrics;

      // ── Resolve recipient: owner's email ─────────────────────────────────
      const { data: ownerRecord } = await db
        .from('users')
        .select('email')
        .eq('company_id', company.id)
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle();

      const recipient = (ownerRecord as UserRow | null)?.email;
      if (!recipient) {
        errors.push({ companyId: company.id, error: 'No owner email found' });
        continue;
      }

      // ── Build email ───────────────────────────────────────────────────────
      const subject = `Weekly Summary: ${company.name} (${periodFrom.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${periodTo.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })})`;
      const { html, text } = buildEmailHtml({
        companyName: company.name,
        periodFrom,
        periodTo,
        metrics,
        currency:   company.currency || 'PLN',
      });

      // ── Throttle: 200 ms between sends to respect Resend rate limits ──────
      if (emailsSent > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
      }

      // ── Send or dry-run ───────────────────────────────────────────────────
      let sendResult: SendResult = {};
      if (!dryRun) {
        let attempt = 0;
        while (attempt < 3) {
          sendResult = await sendEmail({ to: recipient, subject, html, text });
          if (!sendResult.error) break;
          attempt++;
          if (attempt < 3) await new Promise<void>((r) => setTimeout(r, 500 * attempt));
        }
      }

      const status: 'sent' | 'failed' | 'dry_run' =
        dryRun ? 'dry_run' : sendResult.error ? 'failed' : 'sent';

      // ── Audit log ─────────────────────────────────────────────────────────
      await (db.from as Function)('email_reports').insert({
        company_id:    company.id,
        actor_user_id: null,
        recipient,
        subject,
        status,
        resend_id:    sendResult.id ?? null,
        period_from:  periodFrom.toISOString(),
        period_to:    periodTo.toISOString(),
        metrics:      metrics as unknown as Json,
        error_detail: sendResult.error ?? null,
      });

      if (status === 'sent' || status === 'dry_run') {
        emailsSent++;
      } else if (sendResult.error) {
        errors.push({ companyId: company.id, error: sendResult.error });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      errors.push({ companyId: company.id, error: message });
      console.error(`[weekly-summary] Company ${company.id} failed:`, message);
    }
  }

  return NextResponse.json({
    companies_processed: companies.length,
    emails_sent:         emailsSent,
    dry_run:             dryRun,
    period_from:         periodFrom.toISOString(),
    period_to:           periodTo.toISOString(),
    errors,
  });
}
