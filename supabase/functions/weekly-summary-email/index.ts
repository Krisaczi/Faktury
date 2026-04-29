import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CompanyRow {
  id: string;
  name: string;
}

interface UserRow {
  email: string;
}

interface InvoiceSummary {
  synced_count: number;
  high_risk_count: number;
  flagged_amount: number;
  currency: string;
}

async function getCompanySummary(
  supabase: ReturnType<typeof createClient>,
  companyId: string
): Promise<InvoiceSummary> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: recentInvoices, error: recentErr } = await supabase
    .from("company_invoices")
    .select("id, amount, currency, overall_risk, created_at")
    .eq("company_id", companyId)
    .gte("created_at", sevenDaysAgo);

  if (recentErr) throw new Error(`Failed to query invoices: ${recentErr.message}`);

  const invoices = recentInvoices ?? [];
  const synced_count = invoices.length;
  const high_risk_invoices = invoices.filter((inv) => inv.overall_risk === "high");
  const high_risk_count = high_risk_invoices.length;

  const highRiskIds = high_risk_invoices.map((inv) => inv.id);
  let flagged_amount = 0;

  if (highRiskIds.length > 0) {
    const { data: flags } = await supabase
      .from("risk_flags")
      .select("invoice_id")
      .in("invoice_id", highRiskIds)
      .eq("severity", "high");

    const flaggedInvoiceIds = new Set((flags ?? []).map((f) => f.invoice_id));
    const flaggedInvoices = invoices.filter((inv) => flaggedInvoiceIds.has(inv.id));
    flagged_amount = flaggedInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
  }

  const currency = invoices[0]?.currency ?? "PLN";

  return { synced_count, high_risk_count, flagged_amount, currency };
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function buildEmailHtml(companyName: string, summary: InvoiceSummary): string {
  const { synced_count, high_risk_count, flagged_amount, currency } = summary;
  const hasActivity = synced_count > 0;
  const flaggedFormatted = formatCurrency(flagged_amount, currency);

  const riskColor = high_risk_count > 0 ? "#dc2626" : "#16a34a";
  const riskBg = high_risk_count > 0 ? "#fef2f2" : "#f0fdf4";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Weekly Invoice Summary</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#1e40af;border-radius:12px 12px 0 0;padding:32px 40px;">
              <p style="margin:0;font-size:13px;font-weight:600;color:#93c5fd;letter-spacing:0.08em;text-transform:uppercase;">Weekly Summary</p>
              <h1 style="margin:8px 0 0;font-size:24px;font-weight:700;color:#ffffff;line-height:1.2;">${escapeHtml(companyName)}</h1>
              <p style="margin:6px 0 0;font-size:14px;color:#bfdbfe;">Last 7 days · ${new Date().toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric" })}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px 40px;">

              ${hasActivity ? `
              <!-- Stats grid -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td width="32%" style="background:#eff6ff;border-radius:10px;padding:20px;text-align:center;">
                    <p style="margin:0;font-size:28px;font-weight:700;color:#1d4ed8;">${synced_count}</p>
                    <p style="margin:6px 0 0;font-size:12px;color:#64748b;font-weight:500;">Invoices synced</p>
                  </td>
                  <td width="4%"></td>
                  <td width="32%" style="background:${riskBg};border-radius:10px;padding:20px;text-align:center;">
                    <p style="margin:0;font-size:28px;font-weight:700;color:${riskColor};">${high_risk_count}</p>
                    <p style="margin:6px 0 0;font-size:12px;color:#64748b;font-weight:500;">High-risk invoices</p>
                  </td>
                  <td width="4%"></td>
                  <td width="28%" style="background:#faf5ff;border-radius:10px;padding:20px;text-align:center;">
                    <p style="margin:0;font-size:18px;font-weight:700;color:#7c3aed;word-break:break-all;">${flaggedFormatted}</p>
                    <p style="margin:6px 0 0;font-size:12px;color:#64748b;font-weight:500;">Flagged amount</p>
                  </td>
                </tr>
              </table>

              ${high_risk_count > 0 ? `
              <!-- Risk alert -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:0 8px 8px 0;padding:16px 20px;">
                    <p style="margin:0;font-size:14px;font-weight:600;color:#991b1b;">Action required</p>
                    <p style="margin:4px 0 0;font-size:13px;color:#b91c1c;">
                      ${high_risk_count} invoice${high_risk_count !== 1 ? "s" : ""} flagged as high-risk this week, totalling ${flaggedFormatted}. Review them in your dashboard.
                    </p>
                  </td>
                </tr>
              </table>
              ` : `
              <!-- All clear -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 8px 8px 0;padding:16px 20px;">
                    <p style="margin:0;font-size:14px;font-weight:600;color:#166534;">All clear</p>
                    <p style="margin:4px 0 0;font-size:13px;color:#15803d;">No high-risk invoices detected this week. Great job!</p>
                  </td>
                </tr>
              </table>
              `}

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-top:8px;">
                    <a href="${Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "https://app.example.com"}/invoices"
                       style="display:inline-block;background:#1d4ed8;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;padding:12px 28px;">
                      View invoices &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              ` : `
              <!-- No activity -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#f8fafc;border-radius:10px;padding:28px;text-align:center;">
                    <p style="margin:0;font-size:32px;">📭</p>
                    <p style="margin:12px 0 4px;font-size:15px;font-weight:600;color:#1e293b;">No invoices this week</p>
                    <p style="margin:0;font-size:13px;color:#64748b;">No invoices were synced from KSeF in the last 7 days. Make sure your token is configured and sync is running.</p>
                  </td>
                </tr>
              </table>
              `}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f1f5f9;border-radius:0 0 12px 12px;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                You are receiving this because you are a member of <strong>${escapeHtml(companyName)}</strong>.<br/>
                This is an automated weekly digest.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildEmailText(companyName: string, summary: InvoiceSummary): string {
  const { synced_count, high_risk_count, flagged_amount, currency } = summary;
  const flaggedFormatted = formatCurrency(flagged_amount, currency);
  return [
    `Weekly Invoice Summary — ${companyName}`,
    `Period: Last 7 days`,
    ``,
    `Invoices synced: ${synced_count}`,
    `High-risk invoices: ${high_risk_count}`,
    `Flagged amount: ${flaggedFormatted}`,
    ``,
    high_risk_count > 0
      ? `ACTION REQUIRED: ${high_risk_count} high-risk invoice(s) totalling ${flaggedFormatted} need review.`
      : `All clear — no high-risk invoices detected this week.`,
  ].join("\n");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendEmail(
  resendApiKey: string,
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@resend.dev",
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: companies, error: compErr } = await supabase
      .from("companies")
      .select("id, name")
      .neq("subscription_status", "cancelled");

    if (compErr) throw new Error(`Failed to fetch companies: ${compErr.message}`);

    const results: { companyId: string; companyName: string; emailsSent: number; errors: string[] }[] = [];

    for (const company of (companies as CompanyRow[]) ?? []) {
      const companyResult = {
        companyId: company.id,
        companyName: company.name,
        emailsSent: 0,
        errors: [] as string[],
      };

      try {
        const { data: companyUsers, error: usersErr } = await supabase
          .from("users")
          .select("email")
          .eq("company_id", company.id)
          .eq("onboarded", true);

        if (usersErr) throw new Error(`Failed to fetch users: ${usersErr.message}`);

        const users = (companyUsers as UserRow[]) ?? [];
        if (users.length === 0) {
          companyResult.errors.push("No onboarded users found");
          results.push(companyResult);
          continue;
        }

        const summary = await getCompanySummary(supabase, company.id);

        const subject = `Weekly Summary: ${summary.synced_count} invoices synced${summary.high_risk_count > 0 ? ` · ${summary.high_risk_count} high-risk` : ""}`;
        const html = buildEmailHtml(company.name, summary);
        const text = buildEmailText(company.name, summary);

        for (const user of users) {
          if (!user.email) continue;
          try {
            await sendEmail(resendApiKey, user.email, subject, html, text);
            companyResult.emailsSent++;
          } catch (err) {
            companyResult.errors.push(`${user.email}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        companyResult.errors.push(err instanceof Error ? err.message : String(err));
      }

      results.push(companyResult);
    }

    const totalEmails = results.reduce((s, r) => s + r.emailsSent, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

    return new Response(
      JSON.stringify({
        success: true,
        companiesProcessed: results.length,
        totalEmailsSent: totalEmails,
        totalErrors,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
