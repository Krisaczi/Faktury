import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ─── CORS ────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParsedInvoice {
  invoiceNumber?: string;
  vendorName?: string;
  vendorNip?: string;
  invoiceDate?: string;
  dueDate?: string;
  totalAmount?: number;
  taxAmount?: number;
  currency?: string;
  sellerNip?: string;
  buyerNip?: string;
  bankAccount?: string;
}

interface ParseError {
  message: string;
  context?: string;
}

interface ParseResult {
  invoices: ParsedInvoice[];
  errors: ParseError[];
}

// ─── Security ────────────────────────────────────────────────────────────────

const XXE_PATTERNS = [
  /<!ENTITY\s/i,
  /<!DOCTYPE[^>]*\[/i,
  /SYSTEM\s+["'][^"']+["']/i,
  /PUBLIC\s+["'][^"']+["']/i,
];

function detectXXE(xml: string): boolean {
  return XXE_PATTERNS.some((p) => p.test(xml));
}

// ─── XML helpers ─────────────────────────────────────────────────────────────

function extractFirst(xml: string, ...tags: string[]): string | undefined {
  for (const tag of tags) {
    const bare = tag.replace(/^[^:]+:/, "");
    const patterns = [
      new RegExp(`<[^:>]*:${bare}[^>]*>([^<]*)<`, "i"),
      new RegExp(`<${bare}[^>]*>([^<]*)<`, "i"),
      new RegExp(`<[^:>]*:${tag}[^>]*>([^<]*)<`, "i"),
      new RegExp(`<${tag}[^>]*>([^<]*)<`, "i"),
    ];
    for (const p of patterns) {
      const m = xml.match(p);
      if (m && m[1].trim()) return m[1].trim();
    }
  }
  return undefined;
}

function extractSegments(xml: string, tag: string): string[] {
  const segments: string[] = [];
  const bare = tag.replace(/^[^:]+:/, "");
  const open = new RegExp(`<(?:[^:>]*:)?${bare}[^>]*>`, "gi");
  const close = new RegExp(`</(?:[^:>]*:)?${bare}>`, "gi");

  const openMatches = Array.from(xml.matchAll(open));
  const closeMatches = Array.from(xml.matchAll(close));

  for (let i = 0; i < Math.min(openMatches.length, closeMatches.length); i++) {
    const om = openMatches[i];
    const cm = closeMatches[i];
    if (om.index !== undefined && cm.index !== undefined) {
      const start = om.index + om[0].length;
      const end = cm.index;
      if (end > start) segments.push(xml.slice(start, end));
    }
  }
  return segments;
}

function parseAmount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = parseFloat(raw.replace(",", ".").replace(/[^\d.-]/g, ""));
  return isNaN(n) ? undefined : n;
}

function parseDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const dm = t.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
  return undefined;
}

function detectXmlFormat(xml: string): "ksef" | "ubl" | "generic" {
  if (/urn:mf\.gov\.pl|KSeF|Faktura/i.test(xml)) return "ksef";
  if (/urn:oasis:names:specification:ubl|xmlns:cbc/i.test(xml)) return "ubl";
  return "generic";
}

function parseKsefSegment(seg: string): ParsedInvoice {
  return {
    invoiceNumber: extractFirst(seg, "P_2", "NrFa", "NumerFaktury"),
    vendorName: extractFirst(seg, "NazwaSprzedawcy", "NazwaFirmy", "Nazwa"),
    vendorNip: extractFirst(seg, "NIP", "NIPSprzedawcy", "NIPUE"),
    invoiceDate: parseDate(extractFirst(seg, "P_1", "DataWystawienia", "DataFa")),
    dueDate: parseDate(extractFirst(seg, "P_6", "TerminPlatnosci", "DataPlatnosci")),
    totalAmount: parseAmount(extractFirst(seg, "P_15", "WartoscFaktury", "KwotaDoZaplaty", "Wartosc")),
    taxAmount: parseAmount(extractFirst(seg, "P_14", "KwotaPodatku", "KwotaVAT")),
    currency: extractFirst(seg, "KodWaluty", "Waluta") ?? "PLN",
    sellerNip: extractFirst(seg, "NIP", "NIPSprzedawcy", "NIPUE"),
    buyerNip: extractFirst(seg, "NIPNabywcy", "NIPKupujacego"),
    bankAccount: extractFirst(seg, "NrRachunku", "NumerRachunku", "RachunekBankowy"),
  };
}

function parseUBLSegment(seg: string): ParsedInvoice {
  return {
    invoiceNumber: extractFirst(seg, "cbc:ID", "ID"),
    vendorName: extractFirst(seg, "cac:PartyName", "cbc:Name", "Name"),
    vendorNip: extractFirst(seg, "cbc:CompanyID", "CompanyID"),
    invoiceDate: parseDate(extractFirst(seg, "cbc:IssueDate", "IssueDate")),
    dueDate: parseDate(extractFirst(seg, "cbc:PaymentDueDate", "DueDate")),
    totalAmount: parseAmount(extractFirst(seg, "cbc:PayableAmount", "PayableAmount", "TaxInclusiveAmount")),
    taxAmount: parseAmount(extractFirst(seg, "cbc:TaxAmount", "TaxAmount")),
    currency: extractFirst(seg, "cbc:DocumentCurrencyCode", "DocumentCurrencyCode") ?? "PLN",
    sellerNip: extractFirst(seg, "cbc:CompanyID", "CompanyID"),
    bankAccount: extractFirst(seg, "cbc:PaymentID", "PaymentID"),
  };
}

function parseGenericSegment(seg: string): ParsedInvoice {
  return {
    invoiceNumber: extractFirst(seg, "invoice_number", "InvoiceNumber", "Number", "Nr"),
    vendorName: extractFirst(seg, "vendor_name", "VendorName", "SellerName", "Sprzedawca"),
    vendorNip: extractFirst(seg, "seller_nip", "SellerNIP", "NIP"),
    invoiceDate: parseDate(extractFirst(seg, "invoice_date", "InvoiceDate", "Date", "IssueDate")),
    dueDate: parseDate(extractFirst(seg, "due_date", "DueDate", "PaymentDate")),
    totalAmount: parseAmount(extractFirst(seg, "total_amount", "TotalAmount", "Total", "GrossAmount")),
    taxAmount: parseAmount(extractFirst(seg, "tax_amount", "TaxAmount", "VAT")),
    currency: extractFirst(seg, "currency", "Currency", "CurrencyCode") ?? "PLN",
    sellerNip: extractFirst(seg, "seller_nip", "SellerNIP", "NIP"),
    buyerNip: extractFirst(seg, "buyer_nip", "BuyerNIP"),
    bankAccount: extractFirst(seg, "bank_account", "BankAccount", "IBAN"),
  };
}

function parseXml(xmlContent: string): ParseResult {
  if (detectXXE(xmlContent)) {
    return {
      invoices: [],
      errors: [{ message: "XML rejected: external entity declarations are not permitted", context: "security" }],
    };
  }

  if (!xmlContent.trim().startsWith("<")) {
    return {
      invoices: [],
      errors: [{ message: "File does not appear to be valid XML", context: "validation" }],
    };
  }

  const format = detectXmlFormat(xmlContent);
  const roots = ["Faktura", "FA", "Invoice", "INVOICE", "faktura"];
  let segments: string[] = [];
  for (const root of roots) {
    const segs = extractSegments(xmlContent, root);
    if (segs.length > 0) { segments = segs; break; }
  }
  if (segments.length === 0) segments = [xmlContent];

  const invoices: ParsedInvoice[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < segments.length; i++) {
    try {
      const parsed =
        format === "ksef" ? parseKsefSegment(segments[i])
        : format === "ubl" ? parseUBLSegment(segments[i])
        : parseGenericSegment(segments[i]);

      if (!parsed.invoiceNumber && !parsed.invoiceDate && !parsed.totalAmount) {
        errors.push({ message: "Could not extract invoice fields from segment", context: `Segment ${i + 1}` });
        continue;
      }
      invoices.push(parsed);
    } catch (err) {
      errors.push({ message: err instanceof Error ? err.message : "Parse error", context: `Segment ${i + 1}` });
    }
  }

  return { invoices, errors };
}

// ─── CSV parser ──────────────────────────────────────────────────────────────

function parseCsv(content: string): ParseResult {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { invoices: [], errors: [{ message: "CSV must have a header row and at least one data row" }] };
  }

  const FIELD_ALIASES: Record<string, string[]> = {
    invoiceNumber:  ["invoice_number", "invoice number", "number", "nr", "faktura"],
    vendorName:     ["vendor_name", "vendor", "seller", "sprzedawca", "name"],
    vendorNip:      ["vendor_nip", "seller_nip", "nip", "tax_id"],
    invoiceDate:    ["invoice_date", "issue_date", "date", "data_wystawienia"],
    dueDate:        ["due_date", "payment_date", "termin_platnosci"],
    totalAmount:    ["total_amount", "total", "amount", "gross", "wartosc"],
    taxAmount:      ["tax_amount", "tax", "vat", "kwota_vat"],
    currency:       ["currency", "waluta"],
    sellerNip:      ["seller_nip", "nip_sprzedawcy", "nip"],
    buyerNip:       ["buyer_nip", "nip_nabywcy"],
    bankAccount:    ["bank_account", "iban", "account", "nr_rachunku"],
  };

  // Parse header, handling optional quotes
  const parseRow = (line: string): string[] =>
    line.split(",").map((cell) => cell.trim().replace(/^["']|["']$/g, "").trim());

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase());

  // Build column index map
  const colIndex: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const idx = headers.indexOf(alias);
      if (idx !== -1 && colIndex[field] === undefined) {
        colIndex[field] = idx;
        break;
      }
    }
  }

  const invoices: ParsedInvoice[] = [];
  const errors: ParseError[] = [];

  for (let i = 1; i < lines.length; i++) {
    try {
      const cells = parseRow(lines[i]);
      const get = (field: string): string | undefined => {
        const idx = colIndex[field];
        return idx !== undefined ? cells[idx] || undefined : undefined;
      };

      const inv: ParsedInvoice = {
        invoiceNumber: get("invoiceNumber"),
        vendorName:    get("vendorName"),
        vendorNip:     get("vendorNip"),
        invoiceDate:   parseDate(get("invoiceDate")),
        dueDate:       parseDate(get("dueDate")),
        totalAmount:   parseAmount(get("totalAmount")),
        taxAmount:     parseAmount(get("taxAmount")),
        currency:      get("currency") ?? "PLN",
        sellerNip:     get("sellerNip") ?? get("vendorNip"),
        buyerNip:      get("buyerNip"),
        bankAccount:   get("bankAccount"),
      };

      if (!inv.invoiceNumber && !inv.invoiceDate && !inv.totalAmount) {
        errors.push({ message: "Row has no recognizable invoice fields", context: `Row ${i + 1}` });
        continue;
      }
      invoices.push(inv);
    } catch (err) {
      errors.push({ message: err instanceof Error ? err.message : "Row parse error", context: `Row ${i + 1}` });
    }
  }

  return { invoices, errors };
}

// ─── PDF text extractor ──────────────────────────────────────────────────────
// Extracts embedded text from a PDF binary buffer using cross-reference stream
// parsing. We avoid npm:pdf-parse (Node fs dependency) and instead do a
// lightweight regex extraction of text-stream operators for Deno compatibility.

function extractPdfText(buffer: Uint8Array): string {
  // Decode as Latin-1 so byte values map 1:1 to char codes
  let raw = "";
  for (let i = 0; i < buffer.length; i++) {
    raw += String.fromCharCode(buffer[i]);
  }

  // Extract all content between BT (Begin Text) and ET (End Text) markers
  const textBlocks: string[] = [];
  const btEt = /BT([\s\S]*?)ET/g;
  let m: RegExpExecArray | null;

  while ((m = btEt.exec(raw)) !== null) {
    const block = m[1];
    // Tj / TJ operators carry visible text
    // Parenthesized strings: (text)Tj or [(text)(more)]TJ
    const tjStrings = block.matchAll(/\(([^)]*)\)\s*Tj/g);
    for (const tj of tjStrings) textBlocks.push(tj[1]);

    const tjArrays = block.matchAll(/\[([^\]]*)\]\s*TJ/g);
    for (const tja of tjArrays) {
      const inner = tja[1].matchAll(/\(([^)]*)\)/g);
      for (const s of inner) textBlocks.push(s[1]);
    }
  }

  // Decode common PDF escape sequences
  return textBlocks
    .join(" ")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function parsePdf(buffer: Uint8Array): ParseResult {
  const text = extractPdfText(buffer);
  if (!text.trim()) {
    return { invoices: [], errors: [{ message: "No extractable text found in PDF (may be scanned/image-only)" }] };
  }

  // Heuristic field extraction from free text
  function findPattern(patterns: RegExp[]): string | undefined {
    for (const p of patterns) {
      const m = text.match(p);
      if (m && m[1]?.trim()) return m[1].trim();
    }
    return undefined;
  }

  const inv: ParsedInvoice = {
    invoiceNumber: findPattern([
      /invoice\s*(?:no|number|#)[:\s]+([A-Z0-9\/\-]+)/i,
      /faktura\s*(?:nr|numer)[:\s]+([A-Z0-9\/\-]+)/i,
      /nr\s+faktury[:\s]+([A-Z0-9\/\-]+)/i,
    ]),
    vendorName: findPattern([
      /(?:vendor|seller|sold by|sprzedawca|wystawca)[:\s]+([^\n]+)/i,
      /^([A-Z][a-zA-Z\s&.,]+(?:Sp\.\s*z\s*o\.o|S\.A\.|Ltd|GmbH|Inc)\.?)/m,
    ]),
    vendorNip: findPattern([
      /NIP[:\s]+(\d{10}|\d{3}-\d{3}-\d{2}-\d{2}|\d{3}-\d{2}-\d{2}-\d{3})/i,
    ]),
    invoiceDate: parseDate(findPattern([
      /(?:invoice date|issue date|data wystawienia|date)[:\s]+(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{4}|\d{4}-\d{2}-\d{2})/i,
    ])),
    dueDate: parseDate(findPattern([
      /(?:due date|payment date|termin p[łl]atno[śs]ci)[:\s]+(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{4}|\d{4}-\d{2}-\d{2})/i,
    ])),
    totalAmount: parseAmount(findPattern([
      /(?:total|amount due|do zap[łl]aty|razem)[:\s]+([0-9\s,.]+)/i,
    ])),
    taxAmount: parseAmount(findPattern([
      /(?:vat|tax amount|kwota vat)[:\s]+([0-9\s,.]+)/i,
    ])),
    currency: findPattern([
      /\b(PLN|EUR|USD|GBP|CHF|CZK)\b/,
    ]) ?? "PLN",
    sellerNip: findPattern([
      /NIP[:\s]+(\d{10}|\d{3}-\d{3}-\d{2}-\d{2})/i,
    ]),
    bankAccount: findPattern([
      /(?:bank account|IBAN|nr rachunku)[:\s]+([\dA-Z\s]{15,34})/i,
      /([A-Z]{2}\d{2}[\dA-Z]{11,29})/,
    ]),
  };

  if (!inv.invoiceNumber && !inv.invoiceDate && !inv.totalAmount) {
    return {
      invoices: [],
      errors: [{ message: "Could not extract invoice fields from PDF text", context: "pdf" }],
    };
  }

  return { invoices: [inv], errors: [] };
}

// ─── Risk flag generation ─────────────────────────────────────────────────────

type Severity = "info" | "low" | "medium" | "high" | "critical";

interface RiskFlag {
  flag_type: string;
  severity: Severity;
  message: string;
}

function generateRiskFlags(inv: ParsedInvoice): RiskFlag[] {
  const flags: RiskFlag[] = [];

  if (!inv.sellerNip && !inv.vendorNip) {
    flags.push({ flag_type: "missing_seller_nip", severity: "medium", message: "Seller NIP not found in document" });
  }
  if (!inv.bankAccount) {
    flags.push({ flag_type: "missing_bank_account", severity: "medium", message: "Bank account not present in invoice" });
  }
  if (!inv.invoiceNumber) {
    flags.push({ flag_type: "missing_invoice_number", severity: "low", message: "Invoice number could not be extracted" });
  }
  if (!inv.dueDate) {
    flags.push({ flag_type: "missing_due_date", severity: "info", message: "Payment due date not specified" });
  }
  if (inv.totalAmount && inv.totalAmount > 50_000) {
    flags.push({
      flag_type: "high_value",
      severity: "high",
      message: `High-value invoice: ${inv.currency ?? "PLN"} ${inv.totalAmount.toLocaleString()}`,
    });
  }
  if (inv.invoiceDate && inv.dueDate && inv.dueDate < inv.invoiceDate) {
    flags.push({ flag_type: "due_before_issue", severity: "high", message: "Due date is earlier than invoice issue date" });
  }

  return flags;
}

function maxSeverity(flags: RiskFlag[]): "low" | "medium" | "high" | "critical" | null {
  if (flags.length === 0) return null;
  const order: Severity[] = ["info", "low", "medium", "high", "critical"];
  let max: Severity = "info";
  for (const f of flags) {
    if (order.indexOf(f.severity) > order.indexOf(max)) max = f.severity;
  }
  return max === "info" ? "low" : (max as "low" | "medium" | "high" | "critical");
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // ── Auth: verify caller JWT ───────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerJwt = authHeader.slice(7);

    // Anon client — used only to verify the caller's identity
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${callerJwt}` } } }
    );

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Service-role client — bypasses RLS for internal writes ────────────────
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Resolve caller's company_id ───────────────────────────────────────────
    const { data: userRecord } = await adminClient
      .from("users")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userRecord?.company_id) {
      return new Response(JSON.stringify({ error: "User has no associated company" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const companyId: string = userRecord.company_id;

    // ── Parse request body ────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body || typeof body.fileUrl !== "string") {
      return new Response(JSON.stringify({ error: "Missing required field: fileUrl" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { fileUrl, uploadSessionId } = body as { fileUrl: string; uploadSessionId?: string };

    // ── Optionally verify uploadSession ownership ─────────────────────────────
    if (uploadSessionId) {
      const { data: session } = await adminClient
        .from("upload_sessions")
        .select("id, company_id")
        .eq("id", uploadSessionId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (!session) {
        return new Response(JSON.stringify({ error: "Upload session not found or access denied" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Determine file type ───────────────────────────────────────────────────
    const urlPath = new URL(fileUrl.startsWith("http") ? fileUrl : `https://x.com/${fileUrl}`).pathname;
    const ext = urlPath.split(".").pop()?.toLowerCase() ?? "";

    let detectedType: "xml" | "csv" | "pdf" | "unknown" = "unknown";
    if (ext === "xml") detectedType = "xml";
    else if (ext === "csv") detectedType = "csv";
    else if (ext === "pdf") detectedType = "pdf";

    // ── Download file ─────────────────────────────────────────────────────────
    // Support both full signed URLs and storage paths (bucket/path)
    let downloadUrl = fileUrl;
    if (!fileUrl.startsWith("http")) {
      // Treat as storage path: "bucket-name/path/to/file.xml"
      const slashIdx = fileUrl.indexOf("/");
      const bucket = fileUrl.slice(0, slashIdx);
      const path   = fileUrl.slice(slashIdx + 1);
      const { data: signed, error: signErr } = await adminClient.storage
        .from(bucket)
        .createSignedUrl(path, 300);
      if (signErr || !signed?.signedUrl) {
        return new Response(JSON.stringify({ error: "Failed to generate download URL", detail: signErr?.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      downloadUrl = signed.signedUrl;
    }

    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) {
      return new Response(JSON.stringify({ error: `Failed to download file: ${fileRes.statusText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check content-length before reading
    const contentLength = Number(fileRes.headers.get("content-length") ?? 0);
    if (contentLength > 50 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "File exceeds 50 MB limit" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Detect type from MIME if extension was ambiguous
    if (detectedType === "unknown") {
      const mime = fileRes.headers.get("content-type") ?? "";
      if (mime.includes("xml"))  detectedType = "xml";
      else if (mime.includes("csv") || mime.includes("text/plain")) detectedType = "csv";
      else if (mime.includes("pdf")) detectedType = "pdf";
    }

    // ── Parse content by type ─────────────────────────────────────────────────
    let parseResult: ParseResult;

    if (detectedType === "xml") {
      const text = await fileRes.text();
      parseResult = parseXml(text);
    } else if (detectedType === "csv") {
      const text = await fileRes.text();
      parseResult = parseCsv(text);
    } else if (detectedType === "pdf") {
      const buffer = new Uint8Array(await fileRes.arrayBuffer());
      parseResult = parsePdf(buffer);
    } else {
      // Attempt XML as fallback for unknown types
      const text = await fileRes.text();
      parseResult = parseXml(text);
      if (parseResult.invoices.length === 0 && parseResult.errors.length > 0) {
        parseResult = parseCsv(text);
      }
    }

    if (parseResult.invoices.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No invoices could be parsed from the file",
          parseErrors: parseResult.errors,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Process each parsed invoice ────────────────────────────────────────────
    const results: Array<{
      invoice_id: string;
      vendor_id: string | null;
      parsed_fields: ParsedInvoice;
      flags_created: number;
    }> = [];
    const processingErrors: ParseError[] = [...parseResult.errors];

    for (const inv of parseResult.invoices) {
      try {
        // ── Vendor resolution ─────────────────────────────────────────────────
        let vendorId: string | null = null;
        const lookupNip   = inv.vendorNip ?? inv.sellerNip;
        const lookupName  = inv.vendorName;

        if (lookupNip || lookupName) {
          // Try NIP first (most precise), then name
          let query = adminClient
            .from("vendors")
            .select("id")
            .eq("company_id", companyId);

          if (lookupNip) {
            query = query.eq("nip", lookupNip);
          } else if (lookupName) {
            query = query.ilike("name", lookupName.trim());
          }

          const { data: existing } = await query.maybeSingle();

          if (existing) {
            vendorId = existing.id;
          } else {
            // Create new vendor
            const { data: newVendor } = await adminClient
              .from("vendors")
              .insert({
                company_id: companyId,
                name: lookupName ?? lookupNip ?? "Unknown Vendor",
                nip: lookupNip ?? null,
                status: "active",
              })
              .select("id")
              .single();

            if (newVendor) vendorId = newVendor.id;
          }
        }

        // ── Invoice creation ──────────────────────────────────────────────────
        const { data: invoice, error: invError } = await adminClient
          .from("invoices")
          .insert({
            company_id:        companyId,
            vendor_id:         vendorId,
            invoice_number:    inv.invoiceNumber ?? null,
            invoice_date:      inv.invoiceDate ?? null,
            issue_date:        inv.invoiceDate ?? null,
            due_date:          inv.dueDate ?? null,
            amount:            inv.totalAmount ?? null,
            total_amount:      inv.totalAmount ?? null,
            tax_amount:        inv.taxAmount ?? null,
            currency:          inv.currency ?? "PLN",
            seller_nip:        inv.sellerNip ?? inv.vendorNip ?? null,
            buyer_nip:         inv.buyerNip ?? null,
            bank_account:      inv.bankAccount ?? null,
            raw_file_url:      fileUrl,
            upload_session_id: uploadSessionId ?? null,
            overall_risk:      null,
          })
          .select("id")
          .single();

        if (invError || !invoice) {
          processingErrors.push({ message: invError?.message ?? "Invoice insert failed", context: inv.invoiceNumber });
          continue;
        }

        // ── Risk flags ────────────────────────────────────────────────────────
        const flags = generateRiskFlags(inv);
        let flagsCreated = 0;

        for (const flag of flags) {
          const { error: flagErr } = await adminClient.from("risk_flags").insert({
            invoice_id: invoice.id,
            type:       flag.flag_type,
            severity:   flag.severity,
            message:    flag.message,
            status:     "open",
          });
          if (!flagErr) flagsCreated++;
        }

        // Update overall_risk
        const risk = maxSeverity(flags);
        if (risk) {
          await adminClient
            .from("invoices")
            .update({ overall_risk: risk })
            .eq("id", invoice.id);
        }

        results.push({
          invoice_id:    invoice.id,
          vendor_id:     vendorId,
          parsed_fields: inv,
          flags_created: flagsCreated,
        });
      } catch (err) {
        processingErrors.push({
          message: err instanceof Error ? err.message : "Processing error",
          context: inv.invoiceNumber ?? "unknown",
        });
      }
    }

    // ── Update upload session if provided ─────────────────────────────────────
    if (uploadSessionId) {
      const totalFlags = results.reduce((sum, r) => sum + r.flags_created, 0);
      await adminClient.from("upload_sessions").update({
        status:           processingErrors.length > 0 && results.length === 0 ? "failed" : "completed",
        invoices_created: results.length,
        flags_created:    totalFlags,
        error_count:      processingErrors.length,
        error_detail:     processingErrors as unknown as never,
      }).eq("id", uploadSessionId);
    }

    return new Response(
      JSON.stringify({
        invoices_created: results.length,
        results,
        parse_errors: processingErrors,
        file_type:    detectedType,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[parseInvoice]", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
