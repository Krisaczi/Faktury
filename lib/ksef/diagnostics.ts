/**
 * KSeF pre-submission validation, field mapping, and debug logging.
 *
 * Provides:
 * - validateKsefSubmission(): checks all required fields before sending to KSeF
 * - buildFieldMappings(): shows which invoice fields map to which KSeF XML elements
 * - KsefDebugLogger: persists structured events to ksef_debug_logs table
 */

import type { Database } from '@/types/database';
import { KSEF_RODZAJ_FAKTURY, type DocumentType, type VatRate } from '@/types/issued-invoice';

// ─── Types ────────────────────────────────────────────────────────────────────

export type KsefEventType =
  | 'XML_GENERATED'
  | 'VALIDATION_PASSED'
  | 'VALIDATION_FAILED'
  | 'SUBMISSION_STARTED'
  | 'SUBMISSION_ACCEPTED'
  | 'SUBMISSION_REJECTED'
  | 'RESPONSE_RECEIVED';

export interface ValidationCheck {
  field:      string;
  label:      string;
  ksefField:  string;
  present:    boolean;
  value:      string | null;
  severity:   'error' | 'warning';
  message:    string;
}

export interface ValidationGroup {
  name:   string;
  checks: ValidationCheck[];
}

export interface ValidationResult {
  valid:         boolean;
  errors:        ValidationCheck[];
  warnings:      ValidationCheck[];
  groups:        ValidationGroup[];
  missingFields: string[];
  warningFields: string[];
}

export interface FieldMapping {
  invoiceField:   string;
  ksefElement:    string;
  value:          string | null;
  status:         'mapped' | 'missing' | 'invalid';
  note?:          string;
}

export interface DiagnosticsResult {
  valid:          boolean;
  missingFields:  string[];
  warnings:       string[];
  xmlGenerated:   boolean;
  submitted:      boolean;
  validation:     ValidationResult;
  fieldMappings:  FieldMapping[];
  rawXml:         string | null;
  ksefNumber:     string | null;
  ksefStatus:     string | null;
  submissionDate: string | null;
  lastAttempt:    string | null;
  responsePayload: Record<string, unknown> | null;
  debugLogs:      KsefDebugLogEntry[];
}

export interface KsefDebugLogEntry {
  id:         string;
  eventType:  string;
  status:     string;
  message:    string | null;
  payload:    Record<string, unknown> | null;
  createdAt:  string;
}

// ─── Invoice shape for validation (loose — we accept either platform or issued) ──

interface InvoiceForValidation {
  invoice_number:    string | null;
  invoice_date?:     string | null;
  issue_date?:       string | null;
  due_date?:         string | null;
  payment_method?:   string | null;
  currency?:         string | null;
  document_type?:    string | null;
  seller_name?:      string | null;
  seller_nip?:       string | null;
  seller_address?:   string | null;
  seller_bank_account?: string | null;
  buyer_name?:       string | null;
  buyer_nip?:        string | null;
  buyer_address?:    string | null;
  net_total?:        number | string | null;
  vat_total?:        number | string | null;
  gross_total?:      number | string | null;
  items?:            Array<{ vat_rate?: string; name?: string; quantity?: number | string; net_amount?: number | string }> | null;
  corrected_invoice_number?: string | null;
  corrected_invoice_date?:   string | null;
  correction_reason?:        string | null;
}

// ─── Validation ────────────────────────────────────────────────────────────────

export function validateKsefSubmission(inv: InvoiceForValidation): ValidationResult {
  const groups: ValidationGroup[] = [];
  const errors: ValidationCheck[] = [];
  const warnings: ValidationCheck[] = [];

  function check(
    group: ValidationGroup,
    opts: {
      field: string;
      label: string;
      ksefField: string;
      value: string | null;
      severity?: 'error' | 'warning';
      customValid?: (v: string) => boolean;
      invalidMessage?: string;
    },
  ): ValidationCheck {
    const present = !!opts.value && opts.value.trim() !== '';
    const valid = present && (opts.customValid ? opts.customValid(opts.value!) : true);
    const severity = opts.severity ?? 'error';
    const message = !present
      ? `${opts.label} missing`
      : !valid
        ? (opts.invalidMessage ?? `${opts.label} invalid`)
        : '';
    const c: ValidationCheck = {
      field: opts.field,
      label: opts.label,
      ksefField: opts.ksefField,
      present: valid,
      value: opts.value,
      severity,
      message,
    };
    group.checks.push(c);
    if (!valid && severity === 'error') errors.push(c);
    if (!valid && severity === 'warning') warnings.push(c);
    return c;
  }

  // ── Issuer Data (Podmiot1) ──
  const issuerGroup: ValidationGroup = { name: 'Issuer Data (Sprzedawca)', checks: [] };
  check(issuerGroup, { field: 'seller_nip', label: 'NIP', ksefField: 'Podmiot1/DaneIdentyfikacyjne/NIP', value: inv.seller_nip ?? null, customValid: v => /^\d{10}$/.test(v), invalidMessage: 'NIP must be 10 digits' });
  check(issuerGroup, { field: 'seller_name', label: 'Company Name', ksefField: 'Podmiot1/DaneIdentyfikacyjne/Nazwa', value: inv.seller_name ?? null });
  check(issuerGroup, { field: 'seller_address', label: 'Address', ksefField: 'Podmiot1/Adres', value: inv.seller_address ?? null });
  groups.push(issuerGroup);

  // ── Buyer Data (Podmiot2) ──
  const buyerGroup: ValidationGroup = { name: 'Buyer Data (Nabywca)', checks: [] };
  check(buyerGroup, { field: 'buyer_name', label: 'Company Name', ksefField: 'Podmiot2/DaneIdentyfikacyjne/Nazwa', value: inv.buyer_name ?? null });
  check(buyerGroup, { field: 'buyer_nip', label: 'NIP', ksefField: 'Podmiot2/DaneIdentyfikacyjne/NIP', value: inv.buyer_nip ?? null, severity: 'warning', customValid: v => /^\d{10}$/.test(v), invalidMessage: 'NIP should be 10 digits' });
  check(buyerGroup, { field: 'buyer_address', label: 'Address', ksefField: 'Podmiot2/Adres', value: inv.buyer_address ?? null, severity: 'warning' });
  groups.push(buyerGroup);

  // ── Invoice Data (Fa) ──
  const invoiceGroup: ValidationGroup = { name: 'Invoice Data (Fa)', checks: [] };
  check(invoiceGroup, { field: 'invoice_number', label: 'Invoice Number', ksefField: 'P_2', value: inv.invoice_number ?? null });
  const issueDate = inv.issue_date ?? inv.invoice_date ?? null;
  check(invoiceGroup, { field: 'issue_date', label: 'Invoice Date', ksefField: 'P_1', value: issueDate, customValid: v => /^\d{4}-\d{2}-\d{2}$/.test(v), invalidMessage: 'Date must be YYYY-MM-DD' });
  check(invoiceGroup, { field: 'currency', label: 'Currency', ksefField: 'KodWaluty', value: inv.currency ?? 'PLN', customValid: v => /^[A-Z]{3}$/.test(v) });
  check(invoiceGroup, { field: 'net_total', label: 'Net Total', ksefField: 'P_13_9', value: inv.net_total != null ? String(inv.net_total) : null });
  check(invoiceGroup, { field: 'gross_total', label: 'Gross Total', ksefField: 'P_15', value: inv.gross_total != null ? String(inv.gross_total) : null });
  groups.push(invoiceGroup);

  // ── Payment Data (Platnosc) ──
  const paymentGroup: ValidationGroup = { name: 'Payment Data (Platnosc)', checks: [] };
  check(paymentGroup, { field: 'payment_method', label: 'Payment Method', ksefField: 'FormaPlatnosci', value: inv.payment_method ?? null });
  check(paymentGroup, { field: 'due_date', label: 'Due Date', ksefField: 'TerminPlatnosci/Termin', value: inv.due_date ?? null, customValid: v => /^\d{4}-\d{2}-\d{2}$/.test(v) });
  groups.push(paymentGroup);

  // ── Bank Data ──
  const bankGroup: ValidationGroup = { name: 'Bank Data (RachunekBankowy)', checks: [] };
  check(bankGroup, { field: 'seller_bank_account', label: 'Bank Account', ksefField: 'RachunekBankowy/NrRB', value: inv.seller_bank_account ?? null, severity: 'warning' });
  groups.push(bankGroup);

  // ── Line Items ──
  const itemsGroup: ValidationGroup = { name: 'Line Items (FaWiersz)', checks: [] };
  const hasItems = !!(inv.items && inv.items.length > 0);
  itemsGroup.checks.push({
    field: 'items',
    label: 'Line Items',
    ksefField: 'FaWiersz',
    present: hasItems,
    value: hasItems ? `${inv.items!.length} item(s)` : null,
    severity: 'error',
    message: hasItems ? '' : 'No line items',
  });
  if (hasItems) errors.push(...itemsGroup.checks.filter(c => !c.present));
  else errors.push(itemsGroup.checks[0]);

  // Check each item has required fields
  if (hasItems) {
    inv.items!.forEach((item, idx) => {
      if (!item.name || item.name.trim() === '') {
        const c: ValidationCheck = { field: `items[${idx}].name`, label: `Item ${idx + 1} Name`, ksefField: 'P_7', present: false, value: null, severity: 'error', message: `Item ${idx + 1} name missing` };
        itemsGroup.checks.push(c); errors.push(c);
      }
      if (!item.vat_rate) {
        const c: ValidationCheck = { field: `items[${idx}].vat_rate`, label: `Item ${idx + 1} VAT Rate`, ksefField: 'P_12', present: false, value: null, severity: 'error', message: `Item ${idx + 1} VAT rate missing` };
        itemsGroup.checks.push(c); errors.push(c);
      }
    });
  }
  groups.push(itemsGroup);

  // ── Correction invoice fields ──
  const docType = (inv.document_type ?? 'STANDARD') as DocumentType;
  if (docType === 'CORRECTION') {
    const corrGroup: ValidationGroup = { name: 'Correction Data (Korekta)', checks: [] };
    check(corrGroup, { field: 'corrected_invoice_number', label: 'Corrected Invoice Number', ksefField: 'DaneFaKorygowanej/NrFaKorygowanej', value: inv.corrected_invoice_number ?? null });
    check(corrGroup, { field: 'corrected_invoice_date', label: 'Corrected Invoice Date', ksefField: 'DaneFaKorygowanej/DataWystFaKorygowanej', value: inv.corrected_invoice_date ?? null, customValid: v => /^\d{4}-\d{2}-\d{2}$/.test(v) });
    check(corrGroup, { field: 'correction_reason', label: 'Correction Reason', ksefField: 'PrzyczynaKorekty', value: inv.correction_reason ?? null });
    groups.push(corrGroup);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    groups,
    missingFields: errors.map(e => e.field),
    warningFields: warnings.map(w => w.field),
  };
}

// ─── Field Mapping ────────────────────────────────────────────────────────────

export function buildFieldMappings(inv: InvoiceForValidation): FieldMapping[] {
  const docType = (inv.document_type ?? 'STANDARD') as DocumentType;
  const rodzaj = KSEF_RODZAJ_FAKTURY[docType] ?? 'VAT';
  const issueDate = inv.issue_date ?? inv.invoice_date ?? null;

  const mappings: FieldMapping[] = [
    { invoiceField: 'Invoice Number',    ksefElement: 'P_2',                value: inv.invoice_number ?? null,  status: inv.invoice_number ? 'mapped' : 'missing' },
    { invoiceField: 'Invoice Date',      ksefElement: 'P_1',                value: issueDate,                    status: issueDate ? 'mapped' : 'missing' },
    { invoiceField: 'Currency',          ksefElement: 'KodWaluty',          value: inv.currency ?? 'PLN',       status: 'mapped' },
    { invoiceField: 'Document Type',     ksefElement: 'RodzajFaktury',      value: rodzaj,                       status: 'mapped' },
    { invoiceField: 'Seller NIP',        ksefElement: 'Podmiot1/NIP',       value: inv.seller_nip ?? null,      status: inv.seller_nip ? 'mapped' : 'missing' },
    { invoiceField: 'Seller Name',       ksefElement: 'Podmiot1/Nazwa',     value: inv.seller_name ?? null,     status: inv.seller_name ? 'mapped' : 'missing' },
    { invoiceField: 'Seller Address',    ksefElement: 'Podmiot1/Adres',     value: inv.seller_address ?? null,  status: inv.seller_address ? 'mapped' : 'missing' },
    { invoiceField: 'Buyer NIP',         ksefElement: 'Podmiot2/NIP',       value: inv.buyer_nip ?? null,       status: inv.buyer_nip ? 'mapped' : 'missing', note: 'May use BrakID for simplified invoices' },
    { invoiceField: 'Buyer Name',        ksefElement: 'Podmiot2/Nazwa',     value: inv.buyer_name ?? null,      status: inv.buyer_name ? 'mapped' : 'missing' },
    { invoiceField: 'Payment Method',    ksefElement: 'FormaPlatnosci',     value: inv.payment_method ?? null,  status: inv.payment_method ? 'mapped' : 'missing' },
    { invoiceField: 'Due Date',          ksefElement: 'TerminPlatnosci/Termin', value: inv.due_date ?? null,    status: inv.due_date ? 'mapped' : 'missing' },
    { invoiceField: 'Bank Account',      ksefElement: 'RachunekBankowy/NrRB', value: inv.seller_bank_account ?? null, status: inv.seller_bank_account ? 'mapped' : 'missing' },
    { invoiceField: 'Net Total',         ksefElement: 'P_13_9',             value: inv.net_total != null ? String(inv.net_total) : null, status: inv.net_total != null ? 'mapped' : 'missing' },
    { invoiceField: 'VAT Total',         ksefElement: 'P_14_1..P_14_4',     value: inv.vat_total != null ? String(inv.vat_total) : null, status: inv.vat_total != null ? 'mapped' : 'missing' },
    { invoiceField: 'Gross Total',       ksefElement: 'P_15',               value: inv.gross_total != null ? String(inv.gross_total) : null, status: inv.gross_total != null ? 'mapped' : 'missing' },
  ];

  // VAT rate group mappings
  if (inv.items && inv.items.length > 0) {
    const rateMap = new Map<string, number>();
    for (const item of inv.items) {
      const r = item.vat_rate ?? 'unknown';
      rateMap.set(r, (rateMap.get(r) ?? 0) + 1);
    }
    for (const rate of Array.from(rateMap.keys())) {
      const count = rateMap.get(rate)!;
      const ksefRate = rate === 'np' ? 'np I' : rate === 'np2' ? 'np II' : rate;
      const p13 = rate === '23' ? 'P_13_1' : rate === '8' ? 'P_13_2' : rate === '5' ? 'P_13_3' : rate === '0' ? 'P_13_5' : rate === 'zw' ? 'P_13_7' : rate === 'np' ? 'P_13_8' : rate === 'oo' ? 'P_13_10' : 'P_13_?';
      mappings.push({
        invoiceField: `VAT Rate: ${rate}`,
        ksefElement: `P_12=${ksefRate} → ${p13}`,
        value: `${count} item(s)`,
        status: 'mapped',
      });
    }
  }

  // Correction fields
  if (docType === 'CORRECTION') {
    mappings.push({ invoiceField: 'Corrected Invoice No.', ksefElement: 'DaneFaKorygowanej/NrFaKorygowanej', value: inv.corrected_invoice_number ?? null, status: inv.corrected_invoice_number ? 'mapped' : 'missing' });
    mappings.push({ invoiceField: 'Corrected Invoice Date', ksefElement: 'DaneFaKorygowanej/DataWystFaKorygowanej', value: inv.corrected_invoice_date ?? null, status: inv.corrected_invoice_date ? 'mapped' : 'missing' });
    mappings.push({ invoiceField: 'Correction Reason', ksefElement: 'PrzyczynaKorekty', value: inv.correction_reason ?? null, status: inv.correction_reason ? 'mapped' : 'missing' });
  }

  return mappings;
}

// ─── Debug Logger ──────────────────────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof import('@/lib/supabase/server')['getSupabaseServerClient']> extends Promise<infer T> ? T : never;

export class KsefDebugLogger {
  constructor(
    private supabase: SupabaseClient,
    private invoiceId: string,
  ) {}

  async log(
    eventType: KsefEventType,
    status: 'passed' | 'failed' | 'started' | 'accepted' | 'rejected' | 'info',
    message: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.supabase as any).from('ksef_debug_logs').insert({
        invoice_id: this.invoiceId,
        event_type: eventType,
        status,
        message,
        payload: payload ?? null,
      });
    } catch {
      // Logging is best-effort — never block the submission flow
    }
  }

  static async logWithClient(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    invoiceId: string,
    eventType: KsefEventType,
    status: 'passed' | 'failed' | 'started' | 'accepted' | 'rejected' | 'info',
    message: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await supabase.from('ksef_debug_logs').insert({
        invoice_id: invoiceId,
        event_type: eventType,
        status,
        message,
        payload: payload ?? null,
      });
    } catch {
      // Best-effort
    }
  }
}
