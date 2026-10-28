/**
 * KSeF FA(3) XML validation engine.
 *
 * Validates generated FA(3) XML against two layers:
 * 1. Schema structure: checks that the XML is well-formed, has the correct
 *    namespace, root element, and required child elements in the right order.
 * 2. Business rules: checks that summary totals are consistent, VAT mappings
 *    are valid, P_18 annotations match the VAT categories present, negative
 *    values don't appear in fields where FA(3) disallows them, and correction
 *    references are present when RodzajFaktury=KOR.
 *
 * Usage:
 *   const result = validateFa3Xml(rawXml, invoice);
 *   if (!result.valid) {
 *     // block submission, log errors
 *   }
 */

import type { IssuedInvoiceWithItems } from '@/types/issued-invoice';
import type { VatRate, DocumentType } from '@/types/issued-invoice';
import { KSEF_RODZAJ_FAKTURY } from '@/types/issued-invoice';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning';

export interface XmlValidationError {
  category:   'schema' | 'business';
  severity:   ValidationSeverity;
  rule:       string;
  element?:   string;
  message:    string;
  detail?:    string;
}

export interface XmlValidationResult {
  valid:          boolean;
  errors:         XmlValidationError[];
  warnings:       XmlValidationError[];
  schemaErrors:   XmlValidationError[];
  businessErrors: XmlValidationError[];
  summaryCheck?:  {
    p13Sum:        number;
    p15:           number;
    p13_9:         number;
    netTotal:      number;
    grossTotal:    number;
    consistent:    boolean;
  };
}

// ─── XML parsing helpers ──────────────────────────────────────────────────────

/** Extract the text content of a single XML element. */
function extractElement(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

/** Extract all occurrences of an element. */
function extractAllElements(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

/** Check if an element exists (self-closing or with content). */
function hasElement(xml: string, tag: string): boolean {
  return new RegExp(`<${tag}[\\s/>]`).test(xml);
}

/** Parse a decimal value from a string, returning null if invalid. */
function parseDecimal(s: string | null): number | null {
  if (s == null) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ─── Required FA(3) element sequences ─────────────────────────────────────────

const REQUIRED_ROOT_CHILDREN = ['Naglowek', 'Podmiot1', 'Podmiot2', 'Fa'];

const REQUIRED_FA_CHILDREN_BEFORE_SUMMARY = ['KodWaluty', 'P_1', 'P_2'];

const REQUIRED_FA_CHILDREN_AFTER_SUMMARY = ['P_15', 'Adnotacje', 'RodzajFaktury'];

// ─── VAT rate → P_13 element mapping ──────────────────────────────────────────

const RATE_TO_P13: Record<string, string> = {
  '23': 'P_13_1',
  '8':  'P_13_2',
  '5':  'P_13_3',
  '0':  'P_13_5',
  'zw': 'P_13_7',
  'np': 'P_13_8',
  'oo': 'P_13_10',
};

// ─── Schema validation ────────────────────────────────────────────────────────

function validateSchema(xml: string): XmlValidationError[] {
  const errors: XmlValidationError[] = [];

  // 1. Check XML declaration
  if (!xml.startsWith('<?xml')) {
    errors.push({
      category: 'schema',
      severity: 'error',
      rule: 'xml_declaration',
      message: 'Missing XML declaration at the start of the document',
    });
  }

  // 2. Check root element and namespace
  if (!xml.includes('xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"')) {
    errors.push({
      category: 'schema',
      severity: 'error',
      rule: 'namespace',
      message: 'Missing or incorrect FA(3) namespace',
      detail: 'Expected: http://crd.gov.pl/wzor/2025/06/25/13775/',
    });
  }

  if (!xml.includes('<Faktura')) {
    errors.push({
      category: 'schema',
      severity: 'error',
      rule: 'root_element',
      message: 'Missing <Faktura> root element',
    });
  }

  // 3. Check required root children
  for (const child of REQUIRED_ROOT_CHILDREN) {
    if (!hasElement(xml, child)) {
      errors.push({
        category: 'schema',
        severity: 'error',
        rule: 'required_element',
        element: child,
        message: `Missing required element <${child}>`,
      });
    }
  }

  // 4. Check required <Fa> children before summary
  for (const child of REQUIRED_FA_CHILDREN_BEFORE_SUMMARY) {
    if (!hasElement(xml, child)) {
      errors.push({
        category: 'schema',
        severity: 'error',
        rule: 'required_element',
        element: child,
        message: `Missing required element <${child}> inside <Fa>`,
      });
    }
  }

  // 5. Check required <Fa> children after summary
  for (const child of REQUIRED_FA_CHILDREN_AFTER_SUMMARY) {
    if (!hasElement(xml, child)) {
      errors.push({
        category: 'schema',
        severity: 'error',
        rule: 'required_element',
        element: child,
        message: `Missing required element <${child}> inside <Fa>`,
      });
    }
  }

  // 6. Check element ordering: P_13_9 must come AFTER P_13_8 and BEFORE P_13_10
  const p13_8Pos = xml.indexOf('<P_13_8');
  const p13_9Pos = xml.indexOf('<P_13_9');
  const p13_10Pos = xml.indexOf('<P_13_10');
  const p15Pos = xml.indexOf('<P_15');

  if (p13_8Pos !== -1 && p13_9Pos !== -1 && p13_8Pos > p13_9Pos) {
    errors.push({
      category: 'schema',
      severity: 'error',
      rule: 'element_order',
      element: 'P_13_9',
      message: 'P_13_9 must appear AFTER P_13_8 in the FA(3) sequence',
    });
  }

  if (p13_9Pos !== -1 && p13_10Pos !== -1 && p13_9Pos > p13_10Pos) {
    errors.push({
      category: 'schema',
      severity: 'error',
      rule: 'element_order',
      element: 'P_13_10',
      message: 'P_13_10 must appear AFTER P_13_9 in the FA(3) sequence',
    });
  }

  if (p13_9Pos !== -1 && p15Pos !== -1 && p13_9Pos > p15Pos) {
    errors.push({
      category: 'schema',
      severity: 'error',
      rule: 'element_order',
      element: 'P_15',
      message: 'P_15 must appear AFTER P_13_9 in the FA(3) sequence',
    });
  }

  // 7. Check that Adnotacje comes before RodzajFaktury
  const adnotacjePos = xml.indexOf('<Adnotacje');
  const rodzajPos = xml.indexOf('<RodzajFaktury');
  if (adnotacjePos !== -1 && rodzajPos !== -1 && adnotacjePos > rodzajPos) {
    errors.push({
      category: 'schema',
      severity: 'error',
      rule: 'element_order',
      element: 'Adnotacje',
      message: 'Adnotacje must appear BEFORE RodzajFaktury in the FA(3) sequence',
    });
  }

  // 8. Check that FaWiersz comes after RodzajFaktury (and correction elements)
  const faWierszPos = xml.indexOf('<FaWiersz');
  if (rodzajPos !== -1 && faWierszPos !== -1 && rodzajPos > faWierszPos) {
    errors.push({
      category: 'schema',
      severity: 'error',
      rule: 'element_order',
      element: 'FaWiersz',
      message: 'FaWiersz elements must appear AFTER RodzajFaktury',
    });
  }

  // 9. Check that Rozliczenie and Platnosc come after FaWiersz
  const rozliczeniePos = xml.indexOf('<Rozliczenie');
  const platnoscPos = xml.indexOf('<Platnosc');
  if (faWierszPos !== -1 && rozliczeniePos !== -1 && faWierszPos > rozliczeniePos) {
    errors.push({
      category: 'schema',
      severity: 'error',
      rule: 'element_order',
      element: 'Rozliczenie',
      message: 'Rozliczenie must appear AFTER FaWiersz elements',
    });
  }
  if (faWierszPos !== -1 && platnoscPos !== -1 && faWierszPos > platnoscPos) {
    errors.push({
      category: 'schema',
      severity: 'error',
      rule: 'element_order',
      element: 'Platnosc',
      message: 'Platnosc must appear AFTER FaWiersz elements',
    });
  }

  // 10. Check P_12 values in line items are valid FA(3) rate codes
  const p12Values = extractAllElements(xml, 'P_12');
  const validP12 = ['23', '22', '8', '7', '5', '4', '3', '0', 'zw', 'oo', 'np I', 'np II'];
  for (const p12 of p12Values) {
    if (!validP12.includes(p12)) {
      errors.push({
        category: 'schema',
        severity: 'error',
        rule: 'invalid_vat_rate',
        element: 'P_12',
        message: `Invalid P_12 value "${p12}" — not a valid FA(3) VAT rate code`,
        detail: `Valid values: ${validP12.join(', ')}`,
      });
    }
  }

  return errors;
}

// ─── Business rule validation ─────────────────────────────────────────────────

function validateBusinessRules(
  xml: string,
  invoice: IssuedInvoiceWithItems,
): { errors: XmlValidationError[]; warnings: XmlValidationError[]; summaryCheck?: XmlValidationResult['summaryCheck'] } {
  const errors: XmlValidationError[] = [];
  const warnings: XmlValidationError[] = [];

  // ── Rule 1: Summary totals consistency ──
  // P_13_9 = total net = SUM of all P_13_* per-rate net values
  // P_15 = total gross
  // For non-taxable/exempt/zero rates, net == gross, so P_13_9 should relate to P_15.
  // Specifically: P_15 = P_13_9 + SUM(P_14_*) (VAT amounts for taxable rates)
  const p13Fields = ['P_13_1', 'P_13_2', 'P_13_3', 'P_13_5', 'P_13_7', 'P_13_8', 'P_13_10'];
  const p14Fields = ['P_14_1', 'P_14_2', 'P_14_3'];

  let p13Sum = 0;
  for (const f of p13Fields) {
    const val = parseDecimal(extractElement(xml, f));
    if (val != null) p13Sum += val;
  }

  let p14Sum = 0;
  for (const f of p14Fields) {
    const val = parseDecimal(extractElement(xml, f));
    if (val != null) p14Sum += val;
  }

  const p13_9 = parseDecimal(extractElement(xml, 'P_13_9')) ?? 0;
  const p15 = parseDecimal(extractElement(xml, 'P_15')) ?? 0;

  // P_13_9 must equal the sum of all P_13 per-rate values
  const p13SumRounded = Math.round(p13Sum * 100) / 100;
  const p13_9Rounded = Math.round(p13_9 * 100) / 100;
  if (p13SumRounded !== p13_9Rounded) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'summary_p13_9_mismatch',
      element: 'P_13_9',
      message: `P_13_9 (${p13_9.toFixed(2)}) does not equal the sum of per-rate P_13 values (${p13Sum.toFixed(2)})`,
      detail: `Sum of P_13_1..P_13_10 = ${p13Sum.toFixed(2)}, P_13_9 = ${p13_9.toFixed(2)}`,
    });
  }

  // P_15 must equal P_13_9 + P_14 sum (net + VAT = gross)
  const expectedP15 = Math.round((p13_9 + p14Sum) * 100) / 100;
  const p15Rounded = Math.round(p15 * 100) / 100;
  if (expectedP15 !== p15Rounded) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'summary_p15_mismatch',
      element: 'P_15',
      message: `P_15 (${p15.toFixed(2)}) does not equal P_13_9 + VAT amounts (${expectedP15.toFixed(2)})`,
      detail: `P_13_9=${p13_9.toFixed(2)}, SUM(P_14_*)=${p14Sum.toFixed(2)}, expected P_15=${expectedP15.toFixed(2)}, actual P_15=${p15.toFixed(2)}`,
    });
  }

  // Cross-check against invoice totals
  const invNetRounded = Math.round(invoice.net_total * 100) / 100;
  const invGrossRounded = Math.round(invoice.gross_total * 100) / 100;
  if (p13_9Rounded !== invNetRounded) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'summary_net_total_mismatch',
      element: 'P_13_9',
      message: `P_13_9 (${p13_9.toFixed(2)}) does not match invoice net_total (${invoice.net_total.toFixed(2)})`,
    });
  }
  if (p15Rounded !== invGrossRounded) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'summary_gross_total_mismatch',
      element: 'P_15',
      message: `P_15 (${p15.toFixed(2)}) does not match invoice gross_total (${invoice.gross_total.toFixed(2)})`,
    });
  }

  const consistent = p13SumRounded === p13_9Rounded && expectedP15 === p15Rounded
    && p13_9Rounded === invNetRounded && p15Rounded === invGrossRounded;

  const summaryCheck: XmlValidationResult['summaryCheck'] = {
    p13Sum: p13SumRounded,
    p15: p15Rounded,
    p13_9: p13_9Rounded,
    netTotal: invNetRounded,
    grossTotal: invGrossRounded,
    consistent,
  };

  // ── Rule 2: VAT category mapping — only emit P_13 fields for present rates ──
  const presentRates = new Set<string>();
  for (const item of invoice.items) {
    presentRates.add(item.vat_rate as string);
  }

  // Check that no spurious P_13 fields are emitted for rates NOT in the invoice
  for (const [rate, p13Elem] of Object.entries(RATE_TO_P13)) {
    const ratePresent = presentRates.has(rate);
    const elemPresent = hasElement(xml, p13Elem);
    if (!ratePresent && elemPresent) {
      errors.push({
        category: 'business',
        severity: 'error',
        rule: 'spurious_p13_field',
        element: p13Elem,
        message: `${p13Elem} is present in XML but no line items have VAT rate "${rate}"`,
      });
    }
  }

  // ── Rule 3: P_18 annotation correctness ──
  const p18 = extractElement(xml, 'P_18');
  const hasReverseCharge = presentRates.has('oo');
  const hasExempt = presentRates.has('zw');

  if (p18 === '1' && !hasReverseCharge) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'invalid_p18_reverse_charge',
      element: 'P_18',
      message: 'P_18=1 (reverse charge) but no line items have VAT rate "oo" (reverse charge)',
      detail: 'P_18=1 must only be set when reverse charge (oo) lines are present',
    });
  }

  if (p18 === '1' && hasExempt && !hasReverseCharge) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'invalid_p18_exempt_reverse_charge',
      element: 'P_18',
      message: 'P_18=1 (reverse charge) is invalid for a VAT exempt (zw) invoice — VAT exemption (art. 113) is not reverse charge',
    });
  }

  if (p18 === '2' && hasReverseCharge) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'missing_p18_reverse_charge',
      element: 'P_18',
      message: 'P_18=2 (not applicable) but reverse charge (oo) lines are present — P_18 should be 1',
    });
  }

  // ── Rule 4: No negative P_9A (unit net price) ──
  const p9aValues = extractAllElements(xml, 'P_9A');
  p9aValues.forEach((val, idx) => {
    const n = parseDecimal(val);
    if (n != null && n < 0) {
      errors.push({
        category: 'business',
        severity: 'error',
        rule: 'negative_p9a',
        element: `FaWiersz[${idx}]/P_9A`,
        message: `P_9A contains invalid negative value ${val} — FA(3) does not allow negative unit net prices`,
        detail: 'For correction invoices, keep P_9A positive and reflect the correction via P_11 (net amount)',
      });
    }
  });

  // ── Rule 5: Correction invoice must have required references ──
  const docType = (invoice.document_type ?? 'STANDARD') as DocumentType;
  const rodzaj = extractElement(xml, 'RodzajFaktury');

  if (rodzaj === 'KOR' || docType === 'CORRECTION') {
    if (!hasElement(xml, 'PrzyczynaKorekty')) {
      warnings.push({
        category: 'business',
        severity: 'warning',
        rule: 'missing_correction_reason',
        element: 'PrzyczynaKorekty',
        message: 'Correction invoice (KOR) should include PrzyczynaKorekty (correction reason)',
      });
    }
    if (!hasElement(xml, 'DaneFaKorygowanej')) {
      errors.push({
        category: 'business',
        severity: 'error',
        rule: 'missing_corrected_invoice_ref',
        element: 'DaneFaKorygowanej',
        message: 'Correction invoice (KOR) must include DaneFaKorygowanej (corrected invoice reference)',
      });
    }
    if (!hasElement(xml, 'NrFaKorygowanej')) {
      errors.push({
        category: 'business',
        severity: 'error',
        rule: 'missing_corrected_invoice_number',
        element: 'NrFaKorygowanej',
        message: 'Correction invoice (KOR) must include NrFaKorygowanej (corrected invoice number)',
      });
    }
  }

  // ── Rule 6: Due date valid if present ──
  const termin = extractElement(xml, 'Termin');
  if (termin && !/^\d{4}-\d{2}-\d{2}$/.test(termin)) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'invalid_due_date',
      element: 'Termin',
      message: `Due date "${termin}" is not in YYYY-MM-DD format`,
    });
  }

  // ── Rule 7: P_1 (issue date) must be valid ──
  const p1 = extractElement(xml, 'P_1');
  if (p1 && !/^\d{4}-\d{2}-\d{2}$/.test(p1)) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'invalid_issue_date',
      element: 'P_1',
      message: `Issue date "${p1}" is not in YYYY-MM-DD format`,
    });
  }

  // ── Rule 8: Currency must be 3-letter ISO code ──
  const kodWaluty = extractElement(xml, 'KodWaluty');
  if (kodWaluty && !/^[A-Z]{3}$/.test(kodWaluty)) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'invalid_currency',
      element: 'KodWaluty',
      message: `Currency "${kodWaluty}" is not a valid 3-letter ISO 4217 code`,
    });
  }

  return { errors, warnings, summaryCheck };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate FA(3) XML against schema structure and business rules.
 *
 * @param xml      The raw (unsigned) FA(3) XML string.
 * @param invoice  The source invoice data (for cross-checking totals).
 * @returns        XmlValidationResult with errors, warnings, and summary check.
 */
export function validateFa3Xml(
  xml: string,
  invoice: IssuedInvoiceWithItems,
): XmlValidationResult {
  const schemaErrors = validateSchema(xml);
  const { errors: businessErrors, warnings, summaryCheck } = validateBusinessRules(xml, invoice);

  const allErrors = [...schemaErrors, ...businessErrors];
  const valid = allErrors.length === 0;

  return {
    valid,
    errors: allErrors,
    warnings,
    schemaErrors,
    businessErrors,
    summaryCheck,
  };
}
