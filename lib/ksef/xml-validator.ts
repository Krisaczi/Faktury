/**
 * KSeF FA(3) XML validation engine.
 *
 * Validates generated FA(3) XML against two layers:
 * 1. Schema structure: checks element ordering using the fa3-schema definition
 *    (single source of truth) rather than ad-hoc position checks.
 * 2. Business rules: checks summary totals, VAT mapping consistency, annotation
 *    compatibility, negative value detection, and correction references.
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
import {
  FA_ELEMENT_SEQUENCE,
  ROOT_ELEMENT_SEQUENCE,
  P13_FIELDS,
  P14_FIELDS,
  VALID_P12_VALUES,
  faElementPosition,
} from './fa3-schema';

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

function extractElement(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function extractAllElements(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

function hasElement(xml: string, tag: string): boolean {
  return new RegExp(`<${tag}[\\s/>]`).test(xml);
}

/**
 * Find the byte position of an element's opening tag in the XML string.
 * Uses a regex that matches the full tag name followed by whitespace, '>',
 * or '/>' to avoid false matches on prefix tags (e.g. <P_13_1> vs <P_13_10>).
 * Returns -1 if the element is not present.
 */
function elementPosition(xml: string, tag: string): number {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('<' + escaped + '[\\s/>]');
  const m = xml.match(re);
  return m ? (m.index ?? -1) : -1;
}

function parseDecimal(s: string | null): number | null {
  if (s == null) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ─── Rate → P_13 mapping (derived from schema, not hardcoded) ─────────────────

const RATE_TO_P13: Record<string, string> = Object.fromEntries(
  Object.entries(P13_FIELDS).map(([rate, def]) => [rate, def.element]),
);

// ─── Schema validation (schema-driven) ────────────────────────────────────────

function validateSchema(xml: string): XmlValidationError[] {
  const errors: XmlValidationError[] = [];

  // 1. XML declaration
  if (!xml.startsWith('<?xml')) {
    errors.push({ category: 'schema', severity: 'error', rule: 'xml_declaration', message: 'Missing XML declaration at the start of the document' });
  }

  // 2. Namespace
  if (!xml.includes('xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"')) {
    errors.push({ category: 'schema', severity: 'error', rule: 'namespace', message: 'Missing or incorrect FA(3) namespace', detail: 'Expected: http://crd.gov.pl/wzor/2025/06/25/13775/' });
  }

  // 3. Root element
  if (!xml.includes('<Faktura')) {
    errors.push({ category: 'schema', severity: 'error', rule: 'root_element', message: 'Missing <Faktura> root element' });
  }

  // 4. Required root children
  for (const child of ROOT_ELEMENT_SEQUENCE) {
    if (child.required && !hasElement(xml, child.name)) {
      errors.push({ category: 'schema', severity: 'error', rule: 'required_element', element: child.name, message: `Missing required element <${child.name}>` });
    }
  }

  // 5. Required <Fa> children
  for (const child of FA_ELEMENT_SEQUENCE) {
    if (child.required && !hasElement(xml, child.name)) {
      errors.push({ category: 'schema', severity: 'error', rule: 'required_element', element: child.name, message: `Missing required element <${child.name}> inside <Fa>` });
    }
  }

  // 6. Element ordering — use schema-driven checks
  // For each pair of elements in the FA sequence, verify that if both are
  // present, the earlier-defined element appears before the later one.
  for (let i = 0; i < FA_ELEMENT_SEQUENCE.length; i++) {
    for (let j = i + 1; j < FA_ELEMENT_SEQUENCE.length; j++) {
      const earlier = FA_ELEMENT_SEQUENCE[i].name;
      const later = FA_ELEMENT_SEQUENCE[j].name;
      const earlierPos = elementPosition(xml, earlier);
      const laterPos = elementPosition(xml, later);
      if (earlierPos !== -1 && laterPos !== -1 && earlierPos > laterPos) {
        errors.push({
          category: 'schema',
          severity: 'error',
          rule: 'element_order',
          element: later,
          message: `<${later}> must appear AFTER <${earlier}> in the FA(3) sequence`,
        });
      }
    }
  }

  // 7. P_12 values valid
  const p12Values = extractAllElements(xml, 'P_12');
  for (const p12 of p12Values) {
    if (!VALID_P12_VALUES.includes(p12)) {
      errors.push({
        category: 'schema',
        severity: 'error',
        rule: 'invalid_vat_rate',
        element: 'P_12',
        message: `Invalid P_12 value "${p12}" — not a valid FA(3) VAT rate code`,
        detail: `Valid values: ${VALID_P12_VALUES.join(', ')}`,
      });
    }
  }

  // 8. Rozliczenie and Platnosc must come after FaWiersz
  const faWierszPos = elementPosition(xml, 'FaWiersz');
  const rozliczeniePos = elementPosition(xml, 'Rozliczenie');
  const platnoscPos = elementPosition(xml, 'Platnosc');
  if (faWierszPos !== -1 && rozliczeniePos !== -1 && faWierszPos > rozliczeniePos) {
    errors.push({ category: 'schema', severity: 'error', rule: 'element_order', element: 'Rozliczenie', message: 'Rozliczenie must appear AFTER FaWiersz elements' });
  }
  if (faWierszPos !== -1 && platnoscPos !== -1 && faWierszPos > platnoscPos) {
    errors.push({ category: 'schema', severity: 'error', rule: 'element_order', element: 'Platnosc', message: 'Platnosc must appear AFTER FaWiersz elements' });
  }

  // 9. Adnotacje before RodzajFaktury
  const adnotacjePos = elementPosition(xml, 'Adnotacje');
  const rodzajPos = elementPosition(xml, 'RodzajFaktury');
  if (adnotacjePos !== -1 && rodzajPos !== -1 && adnotacjePos > rodzajPos) {
    errors.push({ category: 'schema', severity: 'error', rule: 'element_order', element: 'Adnotacje', message: 'Adnotacje must appear BEFORE RodzajFaktury in the FA(3) sequence' });
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
  // Collect all P_13 per-rate elements (unique, from schema)
  const perRateElems = new Set<string>();
  for (const def of Object.values(P13_FIELDS)) {
    perRateElems.add(def.element);
  }

  let p13Sum = 0;
  for (const elem of Array.from(perRateElems)) {
    const val = parseDecimal(extractElement(xml, elem));
    if (val != null) p13Sum += val;
  }

  // P_14 elements
  let p14Sum = 0;
  for (const p14Elem of Object.values(P14_FIELDS)) {
    const val = parseDecimal(extractElement(xml, p14Elem));
    if (val != null) p14Sum += val;
  }

  const p13_9 = parseDecimal(extractElement(xml, 'P_13_9')) ?? 0;
  const p15 = parseDecimal(extractElement(xml, 'P_15')) ?? 0;

  const p13SumRounded = Math.round(p13Sum * 100) / 100;
  const p13_9Rounded = Math.round(p13_9 * 100) / 100;
  if (p13SumRounded !== p13_9Rounded) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'summary_p13_9_mismatch',
      element: 'P_13_9',
      message: `P_13_9 (${p13_9.toFixed(2)}) does not equal the sum of per-rate P_13 values (${p13Sum.toFixed(2)})`,
      detail: `Sum of P_13_* = ${p13Sum.toFixed(2)}, P_13_9 = ${p13_9.toFixed(2)}`,
    });
  }

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

  const invNetRounded = Math.round((invoice.net_total ?? 0) * 100) / 100;
  const invGrossRounded = Math.round((invoice.gross_total ?? 0) * 100) / 100;
  if (p13_9Rounded !== invNetRounded) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'summary_net_total_mismatch',
      element: 'P_13_9',
      message: `P_13_9 (${p13_9.toFixed(2)}) does not match invoice net_total (${(invoice.net_total ?? 0).toFixed(2)})`,
    });
  }
  if (p15Rounded !== invGrossRounded) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'summary_gross_total_mismatch',
      element: 'P_15',
      message: `P_15 (${p15.toFixed(2)}) does not match invoice gross_total (${(invoice.gross_total ?? 0).toFixed(2)})`,
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

  // ── Rule 2: VAT category mapping — only emit P_13 for present rates ──
  const presentRates = new Set<string>();
  for (const item of invoice.items) {
    const rate = (item.vat_rate ?? '23') as string;
    const def = P13_FIELDS[rate];
    if (def?.aggregatesWith) {
      presentRates.add(def.aggregatesWith);
      presentRates.add(rate);
    } else {
      presentRates.add(rate);
    }
  }

  const p13ElementsChecked = new Set<string>();
  for (const [rate, p13Elem] of Object.entries(RATE_TO_P13)) {
    if (p13ElementsChecked.has(p13Elem)) continue;
    p13ElementsChecked.add(p13Elem);

    const ratePresent = presentRates.has(rate);
    const elemPresent = hasElement(xml, p13Elem);
    if (!ratePresent && elemPresent) {
      // For aggregated P_13_8: skip if any rate sharing this element is present
      const sharingRates = Object.entries(P13_FIELDS)
        .filter(([, def]) => def.element === p13Elem)
        .map(([r]) => r);
      if (sharingRates.some(r => presentRates.has(r))) continue;

      errors.push({
        category: 'business',
        severity: 'error',
        rule: 'spurious_p13_field',
        element: p13Elem,
        message: `${p13Elem} is present in XML but no line items have a rate mapping to it`,
      });
    }
  }

  // ── Rule 2b: No zero-value P_13 fields ──
  for (const p13Elem of Array.from(perRateElems)) {
    const val = parseDecimal(extractElement(xml, p13Elem));
    if (val != null && Math.round(val * 100) / 100 === 0) {
      errors.push({
        category: 'business',
        severity: 'error',
        rule: 'zero_value_p13_field',
        element: p13Elem,
        message: `${p13Elem} has value 0.00 — zero-value summary fields must not be emitted`,
      });
    }
  }

  // ── Rule 2c: Contradictory VAT categories ──
  const p13_7Val = parseDecimal(extractElement(xml, 'P_13_7'));
  const p13_10Val = parseDecimal(extractElement(xml, 'P_13_10'));
  const hasPositiveExempt = p13_7Val != null && p13_7Val > 0;
  const hasPositiveReverseCharge = p13_10Val != null && p13_10Val > 0;
  if (hasPositiveExempt && hasPositiveReverseCharge) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'contradictory_vat_categories',
      element: 'P_13_7/P_13_10',
      message: 'VAT exemption (P_13_7) and reverse charge (P_13_10) cannot both have positive values',
      detail: `P_13_7=${p13_7Val?.toFixed(2)}, P_13_10=${p13_10Val?.toFixed(2)}`,
    });
  }

  // ── Rule 3: P_18 annotation correctness ──
  const p18 = extractElement(xml, 'P_18');
  const p19 = extractElement(xml, 'P_19');

  if (p18 === '1' && !hasPositiveReverseCharge) {
    errors.push({ category: 'business', severity: 'error', rule: 'invalid_p18_reverse_charge', element: 'P_18', message: 'P_18=1 (reverse charge) but no positive reverse charge (oo) summary is present' });
  }
  if (p18 === '1' && hasExempt(hasPositiveExempt, hasPositiveReverseCharge)) {
    errors.push({ category: 'business', severity: 'error', rule: 'invalid_p18_exempt_reverse_charge', element: 'P_18', message: 'P_18=1 is invalid for a VAT exempt invoice' });
  }
  if (p18 === '1' && p19 === '1') {
    errors.push({ category: 'business', severity: 'error', rule: 'p18_p19_conflict', element: 'P_18/P_19', message: 'P_18=1 (reverse charge) and P_19=1 (VAT exemption) cannot coexist' });
  }
  if (p18 === '2' && hasPositiveReverseCharge && !hasPositiveExempt) {
    errors.push({ category: 'business', severity: 'error', rule: 'missing_p18_reverse_charge', element: 'P_18', message: 'P_18=2 but positive reverse charge (oo) is present — P_18 should be 1' });
  }

  // ── Rule 4: No negative P_9A ──
  const p9aValues = extractAllElements(xml, 'P_9A');
  p9aValues.forEach((val, idx) => {
    const n = parseDecimal(val);
    if (n != null && n < 0) {
      errors.push({ category: 'business', severity: 'error', rule: 'negative_p9a', element: `FaWiersz[${idx}]/P_9A`, message: `P_9A contains invalid negative value ${val}` });
    }
  });

  // ── Rule 5: Correction invoice references ──
  const docType = (invoice.document_type ?? 'STANDARD') as DocumentType;
  const rodzaj = extractElement(xml, 'RodzajFaktury');

  if (rodzaj === 'KOR' || docType === 'CORRECTION') {
    if (!hasElement(xml, 'PrzyczynaKorekty')) {
      warnings.push({ category: 'business', severity: 'warning', rule: 'missing_correction_reason', element: 'PrzyczynaKorekty', message: 'Correction invoice should include PrzyczynaKorekty' });
    }
    if (!hasElement(xml, 'DaneFaKorygowanej')) {
      errors.push({ category: 'business', severity: 'error', rule: 'missing_corrected_invoice_ref', element: 'DaneFaKorygowanej', message: 'Correction invoice must include DaneFaKorygowanej' });
    }
    if (!hasElement(xml, 'NrFaKorygowanej')) {
      errors.push({ category: 'business', severity: 'error', rule: 'missing_corrected_invoice_number', element: 'NrFaKorygowanej', message: 'Correction invoice must include NrFaKorygowanej' });
    }
    const origDate = extractElement(xml, 'DataWystFaKorygowanej');
    if (!origDate) {
      errors.push({ category: 'business', severity: 'error', rule: 'missing_corrected_invoice_date', element: 'DataWystFaKorygowanej', message: 'Correction invoice must include DataWystFaKorygowanej' });
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(origDate)) {
      errors.push({ category: 'business', severity: 'error', rule: 'invalid_corrected_invoice_date', element: 'DataWystFaKorygowanej', message: `Corrected invoice date "${origDate}" is not in YYYY-MM-DD format` });
    }
    // ── Rule 5a: NrKSeFN required when original invoice was submitted to KSeF ──
    const correctedKsefNo = (invoice as unknown as { corrected_invoice_ksef_no?: string | null }).corrected_invoice_ksef_no;
    if (correctedKsefNo && correctedKsefNo.trim()) {
      if (!hasElement(xml, 'NrKSeFN')) {
        errors.push({
          category: 'business',
          severity: 'error',
          rule: 'missing_nr_ksef_corrected',
          element: 'NrKSeFN',
          message: 'Corrected invoice has a KSeF number (corrected_invoice_ksef_no) but NrKSeFN is missing from XML',
          detail: `Expected NrKSeFN = ${correctedKsefNo}`,
        });
      } else {
        const xmlKsefNo = extractElement(xml, 'NrKSeFN');
        if (xmlKsefNo !== correctedKsefNo.trim()) {
          errors.push({
            category: 'business',
            severity: 'error',
            rule: 'nr_ksef_mismatch',
            element: 'NrKSeFN',
            message: `NrKSeFN in XML ("${xmlKsefNo}") does not match corrected_invoice_ksef_no ("${correctedKsefNo}")`,
          });
        }
      }
    }
    // ── Rule 5b: Warn if correction has no KSeF number for original ──
    if (!correctedKsefNo || !correctedKsefNo.trim()) {
      warnings.push({
        category: 'business',
        severity: 'warning',
        rule: 'missing_corrected_ksef_no',
        element: 'NrKSeFN',
        message: 'Correction invoice does not reference the original KSeF number — KSeF may reject if the original was submitted to KSeF',
        detail: 'If the original invoice was submitted to KSeF, NrKSeFN (NrKSeFFaKorygowanej) is required',
      });
    }
  }

  // ── Rule 14: P_12 line-item totals must match P_13 summary fields ──
  // KSeF semantic validation checks that the sum of net amounts per VAT rate
  // in FaWiersz elements equals the corresponding P_13_* summary field.
  const p12ValuesInXml = extractAllElements(xml, 'P_12');
  const netValuesInXml = extractAllElements(xml, 'P_11');
  if (p12ValuesInXml.length > 0 && netValuesInXml.length > 0) {
    const rateTotals = new Map<string, number>();
    for (let i = 0; i < p12ValuesInXml.length; i++) {
      const p12 = p12ValuesInXml[i];
      const net = parseDecimal(netValuesInXml[i]) ?? 0;
      const def = P13_FIELDS[p12];
      if (!def) continue;
      const groupKey = def.aggregatesWith ?? p12;
      const existing = rateTotals.get(groupKey) ?? 0;
      rateTotals.set(groupKey, existing + net);
    }
    for (const [rate, lineSum] of Array.from(rateTotals.entries())) {
      const def = P13_FIELDS[rate];
      if (!def) continue;
      const p13Val = parseDecimal(extractElement(xml, def.element));
      if (p13Val != null) {
        const lineSumR = Math.round(lineSum * 100) / 100;
        const p13ValR = Math.round(p13Val * 100) / 100;
        if (lineSumR !== p13ValR) {
          errors.push({
            category: 'business',
            severity: 'error',
            rule: 'p12_p13_mismatch',
            element: def.element,
            message: `${def.element} (${p13Val.toFixed(2)}) does not match sum of P_11 net values for rate ${def.p12Value} (${lineSum.toFixed(2)})`,
            detail: `Line items with P_12="${def.p12Value}" sum to ${lineSum.toFixed(2)}, but ${def.element} = ${p13Val.toFixed(2)}`,
          });
        }
      }
    }
  }

  // ── Rule 15: Correction VAT category transition validation ──
  // When a correction changes a line item's VAT category (e.g. np → zw),
  // KSeF requires that BOTH the negative (reversal of old) and positive
  // (new category) values appear correctly in the P_13 summary.
  // The engine handles this via line items with negative amounts, but we
  // verify the result is semantically valid.
  if (docType === 'CORRECTION') {
    const itemsByRate = new Map<string, number>();
    for (const item of invoice.items) {
      const rate = (item.vat_rate ?? '23') as string;
      const def = P13_FIELDS[rate];
      if (!def) continue;
      const groupKey = def.aggregatesWith ?? rate;
      const existing = itemsByRate.get(groupKey) ?? 0;
      itemsByRate.set(groupKey, existing + (item.net_amount ?? 0));
    }
    // Check for mixed-sign groups (both positive and negative within same rate)
    const positiveRates: string[] = [];
    const negativeRates: string[] = [];
    for (const [rate, total] of Array.from(itemsByRate.entries())) {
      const totalR = Math.round(total * 100) / 100;
      if (totalR > 0) positiveRates.push(rate);
      if (totalR < 0) negativeRates.push(rate);
    }
    // If a rate has negative net total (reversal) but zero net after aggregation,
    // it should NOT produce a P_13 field (already checked by Rule 2b).
    // If a rate has negative net, it means the correction is reducing that category.
    for (const rate of negativeRates) {
      const def = P13_FIELDS[rate];
      if (!def) continue;
      const p13Val = parseDecimal(extractElement(xml, def.element));
      if (p13Val != null && p13Val < 0) {
        warnings.push({
          category: 'business',
          severity: 'warning',
          rule: 'negative_p13_correction',
          element: def.element,
          message: `${def.element} has negative value ${p13Val.toFixed(2)} — correction reverses ${def.p12Value} category`,
          detail: 'This is valid for corrections but verify the original invoice had this VAT category',
        });
      }
    }
  }

  // ── Rule 16: P_13 field present without corresponding line items ──
  // (Already partially covered by Rule 2, but this catches edge cases where
  // a P_13 field exists but no P_12 line items map to it)
  for (const p13Elem of Array.from(perRateElems)) {
    if (hasElement(xml, p13Elem)) {
      const ratesForElement = Object.entries(P13_FIELDS)
        .filter(([, def]) => def.element === p13Elem)
        .map(([r]) => r);
      const hasMatchingLines = invoice.items.some(item => {
        const rate = (item.vat_rate ?? '23') as string;
        const def = P13_FIELDS[rate];
        if (!def) return false;
        return def.element === p13Elem || (def.aggregatesWith && P13_FIELDS[def.aggregatesWith]?.element === p13Elem);
      });
      if (!hasMatchingLines && !ratesForElement.some(r => presentRates.has(r))) {
        errors.push({
          category: 'business',
          severity: 'error',
          rule: 'orphan_p13_field',
          element: p13Elem,
          message: `${p13Elem} present in XML but no line items map to it (no P_12 values produce this summary field)`,
        });
      }
    }
  }

  // ── Rule 6: Due date format ──
  const termin = extractElement(xml, 'Termin');
  if (termin && !/^\d{4}-\d{2}-\d{2}$/.test(termin)) {
    errors.push({ category: 'business', severity: 'error', rule: 'invalid_due_date', element: 'Termin', message: `Due date "${termin}" is not in YYYY-MM-DD format` });
  }

  // ── Rule 7: P_1 date format ──
  const p1 = extractElement(xml, 'P_1');
  if (p1 && !/^\d{4}-\d{2}-\d{2}$/.test(p1)) {
    errors.push({ category: 'business', severity: 'error', rule: 'invalid_issue_date', element: 'P_1', message: `Issue date "${p1}" is not in YYYY-MM-DD format` });
  }

  // ── Rule 8: Currency ──
  const kodWaluty = extractElement(xml, 'KodWaluty');
  if (kodWaluty && !/^[A-Z]{3}$/.test(kodWaluty)) {
    errors.push({ category: 'business', severity: 'error', rule: 'invalid_currency', element: 'KodWaluty', message: `Currency "${kodWaluty}" is not a valid 3-letter ISO code` });
  }

  // ── Rule 9: Rozliczenie matches P_15 ──
  const doZaplaty = parseDecimal(extractElement(xml, 'DoZaplaty'));
  const doRozliczenia = parseDecimal(extractElement(xml, 'DoRozliczenia'));
  if (doZaplaty != null) {
    if (Math.round(doZaplaty * 100) / 100 !== p15Rounded) {
      errors.push({ category: 'business', severity: 'error', rule: 'rozliczenie_mismatch', element: 'DoZaplaty', message: `DoZaplaty (${doZaplaty.toFixed(2)}) does not match P_15 (${p15.toFixed(2)})` });
    }
  }
  if (doRozliczenia != null) {
    const expectedAbsP15 = Math.round(Math.abs(p15) * 100) / 100;
    if (Math.round(doRozliczenia * 100) / 100 !== expectedAbsP15) {
      errors.push({ category: 'business', severity: 'error', rule: 'rozliczenie_mismatch', element: 'DoRozliczenia', message: `DoRozliczenia (${doRozliczenia.toFixed(2)}) does not match |P_15| (${expectedAbsP15.toFixed(2)})` });
    }
  }

  // ── Rule 10: P_22 (new means of transport) validation ──
  const p22 = extractElement(xml, 'P_22');
  if (p22 === '1') {
    // P_22=1 means this is a new means of transport invoice.
    // Check that at least one line item references transport (P_108A or similar).
    // In practice, the invoice should have relevant transport-related fields.
    const hasTransportIndicator = hasElement(xml, 'P_108A') || hasElement(xml, 'StawkaVatNaTowar');
    if (!hasTransportIndicator) {
      warnings.push({
        category: 'business',
        severity: 'warning',
        rule: 'p22_without_transport_data',
        element: 'P_22',
        message: 'P_22=1 (new means of transport) but no transport-specific line item data detected',
        detail: 'Verify that invoice concerns new means of transport and includes required transport fields',
      });
    }
    // P_22 and margin scheme (PMarzy) are mutually exclusive
    const pMarzy = extractElement(xml, 'PMarzy');
    if (pMarzy === '1') {
      errors.push({
        category: 'business',
        severity: 'error',
        rule: 'p22_pmarzy_conflict',
        element: 'P_22/PMarzy',
        message: 'P_22=1 (new means of transport) and PMarzy=1 (margin scheme) cannot coexist',
        detail: 'New means of transport procedure and margin scheme are mutually exclusive tax procedures',
      });
    }
    // P_22 and VAT exemption (P_19) are incompatible
    if (p19 === '1') {
      errors.push({
        category: 'business',
        severity: 'error',
        rule: 'p22_p19_conflict',
        element: 'P_22/P_19',
        message: 'P_22=1 (new means of transport) and P_19=1 (VAT exemption) cannot coexist',
        detail: 'New means of transport procedure requires VAT taxation; exemption is incompatible',
      });
    }
  }

  // ── Rule 11: PMarzy (margin scheme) validation ──
  const pMarzy = extractElement(xml, 'PMarzy');
  if (pMarzy === '1') {
    // Margin scheme is only valid for specific transaction types (used goods, art, antiques)
    // Check that the invoice doesn't also claim reverse charge or standard VAT rates
    if (p18 === '1') {
      errors.push({
        category: 'business',
        severity: 'error',
        rule: 'pmarzy_reverse_charge_conflict',
        element: 'PMarzy/P_18',
        message: 'PMarzy=1 (margin scheme) and P_18=1 (reverse charge) cannot coexist',
        detail: 'Margin scheme and reverse charge are mutually exclusive tax procedures',
      });
    }
    // Margin scheme should not have standard VAT rate P_13 fields (P_13_1 through P_13_4)
    const hasStandardVat = hasElement(xml, 'P_13_1') || hasElement(xml, 'P_13_2') ||
                           hasElement(xml, 'P_13_3') || hasElement(xml, 'P_13_4');
    if (hasStandardVat) {
      errors.push({
        category: 'business',
        severity: 'error',
        rule: 'pmarzy_with_standard_vat',
        element: 'PMarzy',
        message: 'PMarzy=1 (margin scheme) but standard VAT rate P_13 fields are present',
        detail: 'Margin scheme invoices should not include standard-rate VAT summary fields',
      });
    }
    // Margin scheme should not have VAT amount P_14 fields
    const hasVatAmounts = hasElement(xml, 'P_14_1') || hasElement(xml, 'P_14_2') ||
                          hasElement(xml, 'P_14_3') || hasElement(xml, 'P_14_4');
    if (hasVatAmounts) {
      errors.push({
        category: 'business',
        severity: 'error',
        rule: 'pmarzy_with_vat_amounts',
        element: 'PMarzy',
        message: 'PMarzy=1 (margin scheme) but P_14 VAT amount fields are present',
        detail: 'Margin scheme does not include separate VAT amounts',
      });
    }
  }

  // ── Rule 12: Incompatible tax procedures ──
  // Check for simultaneous presence of multiple special procedure flags
  const specialProcedures: string[] = [];
  if (p22 === '1') specialProcedures.push('P_22 (new means of transport)');
  if (pMarzy === '1') specialProcedures.push('PMarzy (margin scheme)');
  if (p18 === '1') specialProcedures.push('P_18 (reverse charge)');
  if (p19 === '1') specialProcedures.push('P_19 (VAT exemption)');
  if (specialProcedures.length > 2) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'too_many_special_procedures',
      element: 'Adnotacje',
      message: `Multiple incompatible tax procedures detected: ${specialProcedures.join(', ')}`,
      detail: 'At most one special tax procedure (reverse charge OR exemption OR margin OR transport) should be active',
    });
  }

  // ── Rule 13: Inappropriate optional sections (NoweSrodkiTransportu / PMarzy) ──
  // These sections must only appear when explicitly requested via specialProcedure flags.
  // Standard service invoices must never contain them.
  const hasNoweSrodki = hasElement(xml, 'NoweSrodkiTransportu');
  const hasPMarzy = hasElement(xml, 'PMarzy');
  const flags = invoice.specialProcedure;
  const expectsTransport = flags?.newMeansOfTransport === true;
  const expectsMargin = flags?.marginScheme === true;

  if (hasNoweSrodki && !expectsTransport) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'spurious_nowe_srodki_transportu',
      element: 'NoweSrodkiTransportu',
      message: 'NoweSrodkiTransportu section present but invoice is not flagged as new means of transport',
      detail: 'Set specialProcedure.newMeansOfTransport = true only for new means of transport invoices',
    });
  }
  if (hasPMarzy && !expectsMargin) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'spurious_pmarzy',
      element: 'PMarzy',
      message: 'PMarzy section present but invoice is not flagged as margin scheme',
      detail: 'Set specialProcedure.marginScheme = true only for margin scheme invoices (used goods, art, antiques)',
    });
  }

  return { errors, warnings, summaryCheck };
}

function hasExempt(exempt: boolean, reverseCharge: boolean): boolean {
  return exempt && !reverseCharge;
}

// ─── Public API ───────────────────────────────────────────────────────────────

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
