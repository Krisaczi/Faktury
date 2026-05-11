import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ─── CORS ─────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = "low" | "medium" | "high";
type OverallRisk = "low" | "medium" | "high";

interface FlagCandidate {
  type: string;
  severity: Severity;
  message: string;
}

interface CreatedFlag {
  id: string;
  type: string;
  severity: Severity;
  message: string;
}

interface Invoice {
  id: string;
  company_id: string;
  vendor_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  issue_date: string | null;
  due_date: string | null;
  amount: number | null;
  total_amount: number | null;
  bank_account: string | null;
  seller_nip: string | null;
  currency: string | null;
  overall_risk: string | null;
}

interface VendorInvoice {
  id: string;
  invoice_number: string | null;
  amount: number | null;
  total_amount: number | null;
  bank_account: string | null;
  issue_date: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitize(text: string): string {
  return text.replace(/[<>"'&]/g, (c) => {
    switch (c) {
      case "<":  return "&lt;";
      case ">":  return "&gt;";
      case '"':  return "&quot;";
      case "'":  return "&#x27;";
      case "&":  return "&amp;";
      default:   return c;
    }
  }).slice(0, 500);
}

function computeOverallRisk(flags: FlagCandidate[]): OverallRisk {
  if (flags.some((f) => f.severity === "high"))   return "high";
  if (flags.some((f) => f.severity === "medium")) return "medium";
  return "low";
}

function normalizeAccount(account: string): string {
  return account.replace(/[\s\-]/g, "").toUpperCase();
}

// ─── Risk checks ──────────────────────────────────────────────────────────────

/** 1. Missing required fields */
function checkMissingFields(invoice: Invoice): FlagCandidate[] {
  const flags: FlagCandidate[] = [];

  if (!invoice.invoice_number?.trim()) {
    flags.push({
      type: "missing_invoice_number",
      severity: "low",
      message: "Invoice number is missing.",
    });
  }
  if (!invoice.bank_account?.trim()) {
    flags.push({
      type: "missing_bank_account",
      severity: "low",
      message: "Bank account number is missing from the invoice.",
    });
  }
  if (!invoice.issue_date && !invoice.invoice_date) {
    flags.push({
      type: "missing_issue_date",
      severity: "low",
      message: "Invoice issue date is missing.",
    });
  }
  if (!invoice.due_date) {
    flags.push({
      type: "missing_due_date",
      severity: "low",
      message: "Payment due date is missing.",
    });
  }

  return flags;
}

/** 2. Duplicate invoice number within the same company */
function checkDuplicateInvoiceNumber(
  invoice: Invoice,
  companyInvoices: VendorInvoice[]
): FlagCandidate[] {
  if (!invoice.invoice_number?.trim()) return [];

  const normalized = invoice.invoice_number.trim().toUpperCase();
  const duplicates = companyInvoices.filter(
    (i) =>
      i.id !== invoice.id &&
      i.invoice_number?.trim().toUpperCase() === normalized
  );

  if (duplicates.length === 0) return [];

  return [
    {
      type: "duplicate_invoice_number",
      severity: "high",
      message: sanitize(
        `Invoice number "${invoice.invoice_number}" already exists in ${duplicates.length} other invoice(s) for this company.`
      ),
    },
  ];
}

/** 3. Duplicate vendor + amount combination */
function checkDuplicateVendorAmount(
  invoice: Invoice,
  vendorInvoices: VendorInvoice[]
): FlagCandidate[] {
  if (!invoice.vendor_id) return [];

  const amount = invoice.total_amount ?? invoice.amount;
  if (amount === null || amount === undefined) return [];

  const duplicates = vendorInvoices.filter((i) => {
    if (i.id === invoice.id) return false;
    const iAmount = i.total_amount ?? i.amount;
    return iAmount !== null && Math.abs(iAmount - amount) < 0.01;
  });

  if (duplicates.length === 0) return [];

  return [
    {
      type: "duplicate_vendor_amount",
      severity: "medium",
      message: sanitize(
        `Invoice amount ${amount} has already appeared ${duplicates.length} time(s) for this vendor — possible duplicate.`
      ),
    },
  ];
}

/** 4. Bank account change — account not seen in vendor history */
function checkBankAccountChange(
  invoice: Invoice,
  vendorInvoices: VendorInvoice[]
): FlagCandidate[] {
  if (!invoice.bank_account?.trim() || !invoice.vendor_id) return [];

  const currentAccount = normalizeAccount(invoice.bank_account);

  const knownAccounts = new Set(
    vendorInvoices
      .filter((i) => i.id !== invoice.id && i.bank_account?.trim())
      .map((i) => normalizeAccount(i.bank_account!))
  );

  if (knownAccounts.size === 0) return []; // No history to compare against

  if (knownAccounts.has(currentAccount)) return [];

  return [
    {
      type: "bank_account_change",
      severity: "high",
      message: sanitize(
        `Bank account ending in ...${invoice.bank_account.slice(-4)} has not been used by this vendor before.`
      ),
    },
  ];
}

/** 5. Amount outlier — significantly above/below vendor average */
function checkAmountOutlier(
  invoice: Invoice,
  vendorInvoices: VendorInvoice[]
): FlagCandidate[] {
  if (!invoice.vendor_id) return [];

  const amount = invoice.total_amount ?? invoice.amount;
  if (amount === null || amount === undefined || amount <= 0) return [];

  const historicalAmounts = vendorInvoices
    .filter((i) => i.id !== invoice.id)
    .map((i) => i.total_amount ?? i.amount)
    .filter((a): a is number => a !== null && a > 0);

  if (historicalAmounts.length < 3) return []; // Need enough history for a meaningful comparison

  const mean   = historicalAmounts.reduce((s, v) => s + v, 0) / historicalAmounts.length;
  const stdDev = Math.sqrt(
    historicalAmounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / historicalAmounts.length
  );

  // Flag if more than 3 standard deviations from mean (very abnormal)
  // or more than 2 std devs + absolute threshold (abnormal but not extreme)
  const zScore = stdDev > 0 ? Math.abs(amount - mean) / stdDev : 0;

  if (zScore >= 3) {
    const direction = amount > mean ? "above" : "below";
    return [
      {
        type: "amount_outlier",
        severity: "high",
        message: sanitize(
          `Invoice amount is significantly ${direction} this vendor's typical range (mean: ${mean.toFixed(2)}, z-score: ${zScore.toFixed(1)}).`
        ),
      },
    ];
  }

  if (zScore >= 2) {
    const direction = amount > mean ? "above" : "below";
    return [
      {
        type: "amount_outlier",
        severity: "medium",
        message: sanitize(
          `Invoice amount is ${direction} this vendor's typical range (mean: ${mean.toFixed(2)}, deviation: ${zScore.toFixed(1)}x std dev).`
        ),
      },
    ];
  }

  return [];
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return respond({ error: "Unauthorized" }, 401);
    }
    const callerJwt = authHeader.slice(7);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${callerJwt}` } } }
    );

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) return respond({ error: "Unauthorized" }, 401);

    // ── Service-role client ───────────────────────────────────────────────────
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Resolve caller company ────────────────────────────────────────────────
    const { data: userRecord } = await db
      .from("users")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userRecord?.company_id) {
      return respond({ error: "User has no associated company" }, 403);
    }
    const callerCompanyId: string = userRecord.company_id;

    // ── Parse input ───────────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body || typeof body.invoice_id !== "string") {
      return respond({ error: "Missing required field: invoice_id" }, 400);
    }
    const invoiceId: string = body.invoice_id;

    // ── Fetch invoice ─────────────────────────────────────────────────────────
    const { data: invoice, error: invoiceError } = await db
      .from("invoices")
      .select(
        "id, company_id, vendor_id, invoice_number, invoice_date, issue_date, due_date, amount, total_amount, bank_account, seller_nip, currency, overall_risk"
      )
      .eq("id", invoiceId)
      .maybeSingle();

    if (invoiceError || !invoice) {
      return respond({ error: "Invoice not found" }, 404);
    }

    // ── Enforce company scope ─────────────────────────────────────────────────
    if (invoice.company_id !== callerCompanyId) {
      return respond({ error: "Access denied" }, 403);
    }

    // ── Fetch company invoices for duplicate number check ─────────────────────
    const { data: companyInvoices } = await db
      .from("invoices")
      .select("id, invoice_number, amount, total_amount, bank_account, issue_date")
      .eq("company_id", callerCompanyId)
      .not("id", "eq", invoiceId)
      .limit(2000);

    // ── Fetch vendor history for vendor-scoped checks ─────────────────────────
    let vendorInvoices: VendorInvoice[] = [];
    if (invoice.vendor_id) {
      const { data: vi } = await db
        .from("invoices")
        .select("id, invoice_number, amount, total_amount, bank_account, issue_date")
        .eq("vendor_id", invoice.vendor_id)
        .eq("company_id", callerCompanyId)
        .not("id", "eq", invoiceId)
        .order("issue_date", { ascending: false })
        .limit(500);

      vendorInvoices = vi ?? [];
    }

    const allCompanyInvoices: VendorInvoice[] = companyInvoices ?? [];

    // ── Run all checks ────────────────────────────────────────────────────────
    const flagCandidates: FlagCandidate[] = [
      ...checkMissingFields(invoice as Invoice),
      ...checkDuplicateInvoiceNumber(invoice as Invoice, allCompanyInvoices),
      ...checkDuplicateVendorAmount(invoice as Invoice, vendorInvoices),
      ...checkBankAccountChange(invoice as Invoice, vendorInvoices),
      ...checkAmountOutlier(invoice as Invoice, vendorInvoices),
    ];

    // ── Fetch existing open flags to avoid re-creating duplicates ─────────────
    const { data: existingFlags } = await db
      .from("risk_flags")
      .select("type")
      .eq("invoice_id", invoiceId)
      .eq("status", "open");

    const existingTypes = new Set((existingFlags ?? []).map((f: { type: string }) => f.type));
    const newCandidates = flagCandidates.filter((c) => !existingTypes.has(c.type));

    // ── Insert new flags ──────────────────────────────────────────────────────
    const createdFlags: CreatedFlag[] = [];

    for (const candidate of newCandidates) {
      const { data: flag, error: flagError } = await db
        .from("risk_flags")
        .insert({
          invoice_id: invoiceId,
          type:       candidate.type,
          severity:   candidate.severity,
          message:    candidate.message,
          status:     "open",
        })
        .select("id, type, severity, message")
        .single();

      if (!flagError && flag) {
        createdFlags.push(flag as CreatedFlag);
      }
    }

    // ── Compute overall risk across all open flags (existing + new) ────────────
    const { data: allOpenFlags } = await db
      .from("risk_flags")
      .select("severity")
      .eq("invoice_id", invoiceId)
      .eq("status", "open");

    const allFlagSeverities: FlagCandidate[] = (allOpenFlags ?? []).map(
      (f: { severity: string }) => ({ type: "", severity: f.severity as Severity, message: "" })
    );

    const overallRisk: OverallRisk = computeOverallRisk(allFlagSeverities);

    // ── Update invoice overall_risk ───────────────────────────────────────────
    await db
      .from("invoices")
      .update({ overall_risk: overallRisk })
      .eq("id", invoiceId);

    // ── Audit log ─────────────────────────────────────────────────────────────
    await db.from("audit_logs").insert({
      company_id: callerCompanyId,
      user_id:    user.id,
      invoice_id: invoiceId,
      action:     "risk_engine_run",
      metadata:   {
        flags_created:  createdFlags.length,
        overall_risk:   overallRisk,
        checks_run:     5,
      },
    });

    return respond({
      invoice_id:    invoiceId,
      overall_risk:  overallRisk,
      flags_created: createdFlags,
      flags_skipped: flagCandidates.length - newCandidates.length,
      checks_run:    5,
    });
  } catch (err) {
    console.error("[runRiskEngine]", err);
    return respond(
      { error: "Internal server error", detail: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
