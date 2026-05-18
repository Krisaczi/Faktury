/**
 * Safe XML invoice parser.
 *
 * Security:
 * - Uses regex-based extraction rather than a full DOM parser to avoid XXE.
 * - External entity declarations are detected and rejected.
 * - Entity expansion attacks are mitigated by limiting file size upstream.
 *
 * Supports:
 * - KSeF FA (Faktura) namespace: urn:mf.gov.pl:KSeF:wizualizacja:FA:*
 * - UBL 2.1 Invoice
 * - Generic flat-XML with common invoice field names
 */

export interface ParsedInvoice {
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

export interface ParseError {
  message: string;
  context?: string;
}

export interface ParseResult {
  invoices: ParsedInvoice[];
  errors: ParseError[];
}

// Detect XXE patterns — reject if found
const XXE_PATTERNS = [
  /<!ENTITY\s/i,
  /<!DOCTYPE[^>]*\[/i,
  /SYSTEM\s+["'][^"']+["']/i,
  /PUBLIC\s+["'][^"']+["']/i,
];

function detectXXE(xml: string): boolean {
  return XXE_PATTERNS.some((p) => p.test(xml));
}

// Extract text content of the first matching element
function extractFirst(xml: string, ...tags: string[]): string | undefined {
  for (const tag of tags) {
    // Handle namespaced tags: strip prefix for matching
    const bare = tag.replace(/^[^:]+:/, '');
    const patterns = [
      new RegExp(`<[^:>]*:${bare}[^>]*>([^<]*)<`, 'i'),
      new RegExp(`<${bare}[^>]*>([^<]*)<`, 'i'),
      new RegExp(`<[^:>]*:${tag}[^>]*>([^<]*)<`, 'i'),
      new RegExp(`<${tag}[^>]*>([^<]*)<`, 'i'),
    ];
    for (const p of patterns) {
      const m = xml.match(p);
      if (m && m[1].trim()) return m[1].trim();
    }
  }
  return undefined;
}

// Extract vendor name from KSeF FA 2.0 seller block (Podmiot1 or Sprzedawca).
// KSeF structure: <Podmiot1><DaneIdentyfikacyjne><Nazwa>...</Nazwa></DaneIdentyfikacyjne></Podmiot1>
// Also handles OsobaNiefizyczna/NazwaPodmiotu used in some KSeF variants.
function extractKsefSellerName(xml: string): string | undefined {
  // Locate the seller block — KSeF uses Podmiot1 (subject 1 = seller)
  const sellerBlockMatch = xml.match(/<(?:[^:>]*:)?Podmiot1[^>]*>([\s\S]*?)<\/(?:[^:>]*:)?Podmiot1>/i)
    ?? xml.match(/<(?:[^:>]*:)?Sprzedawca[^>]*>([\s\S]*?)<\/(?:[^:>]*:)?Sprzedawca>/i);

  const block = sellerBlockMatch ? sellerBlockMatch[1] : xml;

  return extractFirst(
    block,
    'NazwaPodmiotu',   // OsobaNiefizyczna variant
    'Nazwa',           // DaneIdentyfikacyjne → Nazwa (most common in KSeF FA 2.0)
    'NazwaFirmy',
    'NazwaSprzedawcy',
    'NazwaDostawcy',
    'FullName',
  );
}

// Normalize vendor name: trim whitespace, collapse internal spaces, title-case if all-caps
function normalizeVendorName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  // If entirely uppercase (common in KSeF), convert to title case
  if (trimmed === trimmed.toUpperCase() && /[A-ZĄĆĘŁŃÓŚŹŻ]{3,}/.test(trimmed)) {
    return trimmed
      .toLowerCase()
      .replace(/(^|\s|\.)([\wąćęłńóśźż])/g, (_, pre, c) => pre + c.toUpperCase());
  }
  return trimmed;
}

// Extract all segments between opening/closing element pairs
function extractSegments(xml: string, tag: string): string[] {
  const segments: string[] = [];
  const bare = tag.replace(/^[^:]+:/, '');
  // Match both namespaced and un-namespaced variants
  const open = new RegExp(`<(?:[^:>]*:)?${bare}[^>]*>`, 'gi');
  const close = new RegExp(`</(?:[^:>]*:)?${bare}>`, 'gi');

  let openIdx: number;
  let closeIdx: number;
  let pos = 0;

  const openMatches = Array.from(xml.matchAll(open));
  const closeMatches = Array.from(xml.matchAll(close));

  for (let i = 0; i < Math.min(openMatches.length, closeMatches.length); i++) {
    const om = openMatches[i];
    const cm = closeMatches[i];
    if (om.index !== undefined && cm.index !== undefined) {
      const start = om.index + om[0].length;
      const end = cm.index;
      if (end > start) {
        segments.push(xml.slice(start, end));
      }
    }
  }

  return segments;
}

function parseAmount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = parseFloat(raw.replace(',', '.').replace(/[^\d.-]/g, ''));
  return isNaN(n) ? undefined : n;
}

function parseDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  // ISO date
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  // DD.MM.YYYY
  const dm = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
  return undefined;
}

// ─── KSeF FA parser ──────────────────────────────────────────────────────────
function parseKsefSegment(segment: string): ParsedInvoice {
  // Extract seller NIP from Podmiot1 block specifically to avoid picking up buyer NIP
  const sellerBlock = segment.match(/<(?:[^:>]*:)?Podmiot1[^>]*>([\s\S]*?)<\/(?:[^:>]*:)?Podmiot1>/i)?.[1]
    ?? segment.match(/<(?:[^:>]*:)?Sprzedawca[^>]*>([\s\S]*?)<\/(?:[^:>]*:)?Sprzedawca>/i)?.[1]
    ?? segment;
  const sellerNip = extractFirst(sellerBlock, 'NIP', 'NIPSprzedawcy', 'NIPUE');

  const buyerBlock = segment.match(/<(?:[^:>]*:)?Podmiot2[^>]*>([\s\S]*?)<\/(?:[^:>]*:)?Podmiot2>/i)?.[1]
    ?? segment.match(/<(?:[^:>]*:)?Nabywca[^>]*>([\s\S]*?)<\/(?:[^:>]*:)?Nabywca>/i)?.[1];
  const buyerNip = buyerBlock
    ? extractFirst(buyerBlock, 'NIP', 'NIPNabywcy', 'NIPKupujacego')
    : extractFirst(segment, 'NIPNabywcy', 'NIPKupujacego');

  return {
    invoiceNumber: extractFirst(segment, 'P_2', 'NrFa', 'NumerFaktury'),
    vendorName: normalizeVendorName(extractKsefSellerName(segment)),
    vendorNip: sellerNip,
    invoiceDate: parseDate(extractFirst(segment, 'P_1', 'DataWystawienia', 'DataFa')),
    dueDate: parseDate(extractFirst(segment, 'P_6', 'TerminPlatnosci', 'DataPlatnosci')),
    totalAmount: parseAmount(extractFirst(segment, 'P_15', 'WartoscFaktury', 'KwotaDoZaplaty', 'Wartosc')),
    taxAmount: parseAmount(extractFirst(segment, 'P_14', 'KwotaPodatku', 'KwotaVAT')),
    currency: extractFirst(segment, 'KodWaluty', 'Waluta') ?? 'PLN',
    sellerNip,
    buyerNip,
    bankAccount: extractFirst(segment, 'NrRachunku', 'NumerRachunku', 'RachunekBankowy'),
  };
}

// ─── UBL 2.1 parser ──────────────────────────────────────────────────────────
function parseUBLSegment(segment: string): ParsedInvoice {
  // UBL: seller is in AccountingSupplierParty
  const supplierBlock = segment.match(/<(?:[^:>]*:)?AccountingSupplierParty[^>]*>([\s\S]*?)<\/(?:[^:>]*:)?AccountingSupplierParty>/i)?.[1] ?? segment;
  return {
    invoiceNumber: extractFirst(segment, 'cbc:ID', 'ID'),
    vendorName: normalizeVendorName(extractFirst(supplierBlock, 'cbc:Name', 'cac:PartyName', 'Name')),
    vendorNip: extractFirst(segment, 'cbc:CompanyID', 'CompanyID'),
    invoiceDate: parseDate(extractFirst(segment, 'cbc:IssueDate', 'IssueDate')),
    dueDate: parseDate(extractFirst(segment, 'cbc:PaymentDueDate', 'DueDate')),
    totalAmount: parseAmount(extractFirst(segment, 'cbc:PayableAmount', 'PayableAmount', 'TaxInclusiveAmount')),
    taxAmount: parseAmount(extractFirst(segment, 'cbc:TaxAmount', 'TaxAmount')),
    currency: extractFirst(segment, 'cbc:DocumentCurrencyCode', 'DocumentCurrencyCode') ?? 'PLN',
    sellerNip: extractFirst(segment, 'cac:TaxScheme', 'CompanyID', 'cbc:CompanyID'),
    bankAccount: extractFirst(segment, 'cbc:ID', 'PaymentID'),
  };
}

// ─── Generic flat XML ─────────────────────────────────────────────────────────
function parseGenericSegment(segment: string): ParsedInvoice {
  return {
    invoiceNumber: extractFirst(segment, 'invoice_number', 'InvoiceNumber', 'Number', 'Nr'),
    vendorName: normalizeVendorName(extractFirst(segment, 'vendor_name', 'VendorName', 'SellerName', 'Sprzedawca', 'NazwaSprzedawcy', 'NazwaFirmy')),
    vendorNip: extractFirst(segment, 'seller_nip', 'SellerNIP', 'NIP'),
    invoiceDate: parseDate(extractFirst(segment, 'invoice_date', 'InvoiceDate', 'Date', 'IssueDate')),
    dueDate: parseDate(extractFirst(segment, 'due_date', 'DueDate', 'PaymentDate')),
    totalAmount: parseAmount(extractFirst(segment, 'total_amount', 'TotalAmount', 'Total', 'GrossAmount')),
    taxAmount: parseAmount(extractFirst(segment, 'tax_amount', 'TaxAmount', 'VAT')),
    currency: extractFirst(segment, 'currency', 'Currency', 'CurrencyCode') ?? 'PLN',
    sellerNip: extractFirst(segment, 'seller_nip', 'SellerNIP', 'NIP'),
    buyerNip: extractFirst(segment, 'buyer_nip', 'BuyerNIP'),
    bankAccount: extractFirst(segment, 'bank_account', 'BankAccount', 'IBAN'),
  };
}

function detectFormat(xml: string): 'ksef' | 'ubl' | 'generic' {
  if (/urn:mf\.gov\.pl|KSeF|Faktura/i.test(xml)) return 'ksef';
  if (/urn:oasis:names:specification:ubl|xmlns:cbc/i.test(xml)) return 'ubl';
  return 'generic';
}

export async function parseXmlInvoices(xmlContent: string): Promise<ParseResult> {
  const errors: ParseError[] = [];
  const invoices: ParsedInvoice[] = [];

  // Security check
  if (detectXXE(xmlContent)) {
    return {
      invoices: [],
      errors: [{ message: 'XML rejected: external entity declarations are not permitted', context: 'security' }],
    };
  }

  // Basic well-formedness check
  if (!xmlContent.trim().startsWith('<')) {
    return {
      invoices: [],
      errors: [{ message: 'File does not appear to be valid XML', context: 'validation' }],
    };
  }

  const format = detectFormat(xmlContent);

  // Find invoice root elements
  const ksefRoots = ['Faktura', 'FA', 'Invoice', 'INVOICE', 'faktura'];
  let segments: string[] = [];

  for (const root of ksefRoots) {
    const segs = extractSegments(xmlContent, root);
    if (segs.length > 0) {
      segments = segs;
      break;
    }
  }

  // If no segments found, treat the whole file as one invoice
  if (segments.length === 0) {
    segments = [xmlContent];
  }

  for (let i = 0; i < segments.length; i++) {
    try {
      let parsed: ParsedInvoice;
      if (format === 'ksef') {
        parsed = parseKsefSegment(segments[i]);
      } else if (format === 'ubl') {
        parsed = parseUBLSegment(segments[i]);
      } else {
        parsed = parseGenericSegment(segments[i]);
      }

      // Require at least one meaningful field
      if (!parsed.invoiceNumber && !parsed.invoiceDate && !parsed.totalAmount) {
        errors.push({
          message: 'Could not extract invoice fields from segment',
          context: `Segment ${i + 1}`,
        });
        continue;
      }

      invoices.push(parsed);
    } catch (err) {
      errors.push({
        message: err instanceof Error ? err.message : 'Parse error',
        context: `Segment ${i + 1}`,
      });
    }
  }

  return { invoices, errors };
}
