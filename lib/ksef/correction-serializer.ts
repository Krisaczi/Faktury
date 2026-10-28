/**
 * Dedicated FA(3) correction invoice serializer.
 *
 * Provides a 3-stage validation pipeline specifically for correction invoices:
 *   Stage 1 — Pre-generation validation (correction metadata, original invoice ref)
 *   Stage 2 — XML generation via buildFa2Xml
 *   Stage 3 — Post-generation validation (schema + business rules via validateFa3Xml)
 *
 * Also provides correction type detection (VAT change, value change, quantity
 * change, classification change, customer data change) based on the correction
 * line items and metadata.
 */

import type { IssuedInvoiceWithItems, VatRate } from '@/types/issued-invoice';
import { buildFa2Xml } from './xml-builder';
import { validateFa3Xml, type XmlValidationResult, type XmlValidationError } from './xml-validator';

// ─── Correction type detection ────────────────────────────────────────────────

export type CorrectionType =
  | 'vat_classification'
  | 'value'
  | 'quantity'
  | 'customer_data'
  | 'mixed';

export interface CorrectionTypeInfo {
  type: CorrectionType;
  label: string;
  details: string[];
}

/**
 * Detect the type of correction from the invoice line items and metadata.
 *
 * - VAT classification: line items contain different VAT rates (reversal + new)
 * - Value: same rates, different net amounts (qty same, price changed)
 * - Quantity: same rates, different quantities
 * - Customer data: no line item changes but seller/buyer info changed
 *   (detected via presence of correction_reason mentioning customer/buyer)
 * - Mixed: multiple change types detected
 */
export function detectCorrectionType(invoice: IssuedInvoiceWithItems): CorrectionTypeInfo {
  const items = invoice.items ?? [];
  const rates = new Set(items.map(i => i.vat_rate as VatRate));

  const details: string[] = [];

  // VAT classification change: multiple VAT rates present (reversal + new)
  const hasVatChange = rates.size > 1;
  if (hasVatChange) {
    details.push(`VAT rates changed: ${Array.from(rates).join(' → ')}`);
  }

  // Check for value/quantity changes among same-rate items
  const hasNegativeItems = items.some(i => i.net_amount < 0);
  const hasPositiveItems = items.some(i => i.net_amount > 0);

  // Value change: single rate, negative + positive items (price correction)
  const hasValueChange = rates.size === 1 && hasNegativeItems && hasPositiveItems;
  if (hasValueChange) {
    details.push('Line values corrected (price change)');
  }

  // Quantity change: detected when same rate, same sign pattern but quantities differ
  // This is inferred from the correction context — we can't compare to the original
  // invoice directly, but if there's a single rate with reversal+new, it's likely
  // a value or quantity change
  const reason = (invoice.correction_reason ?? '').toLowerCase();
  const hasQuantityChange = reason.includes('iloś') || reason.includes('ilosc') || reason.includes('quantity');
  if (hasQuantityChange) {
    details.push('Quantity corrected');
  }

  // Customer data change: no line item value changes but correction reason mentions buyer/customer
  const hasCustomerChange = !hasVatChange && !hasValueChange && !hasQuantityChange && (
    reason.includes('nabywc') || reason.includes('kupiec') || reason.includes('customer') || reason.includes('buyer')
  );
  if (hasCustomerChange) {
    details.push('Customer data corrected');
  }

  let type: CorrectionType;

  // Prioritize specific detections over the generic value-change heuristic
  if (hasVatChange) {
    type = 'vat_classification';
  } else if (hasQuantityChange) {
    type = 'quantity';
  } else if (hasCustomerChange) {
    type = 'customer_data';
  } else if (hasValueChange) {
    type = 'value';
  } else {
    type = 'value'; // default fallback for generic corrections
  }

  // "mixed" only when truly independent change types coexist
  const independentChanges = [hasVatChange, (hasValueChange && !hasQuantityChange && !hasCustomerChange), (hasQuantityChange && !hasVatChange), (hasCustomerChange && !hasVatChange && !hasValueChange)].filter(Boolean).length;
  if (independentChanges > 1 && hasVatChange) {
    type = 'mixed';
  }

  const labels: Record<CorrectionType, string> = {
    vat_classification: 'Zmiana stawki VAT',
    value: 'Korekta wartości',
    quantity: 'Korekta ilości',
    customer_data: 'Korekta danych nabywcy',
    mixed: 'Korekta złożona',
  };

  return { type, label: labels[type], details: details.length > 0 ? details : ['General correction'] };
}

// ─── Pre-generation validation ────────────────────────────────────────────────

export interface CorrectionValidationResult {
  valid: boolean;
  errors: XmlValidationError[];
  warnings: XmlValidationError[];
  correctionType: CorrectionTypeInfo;
  xmlValidation: XmlValidationResult | null;
  rawXml: string | null;
}

/**
 * Validate and generate a correction invoice XML through the 3-stage pipeline.
 *
 * Stage 1: Pre-generation — check correction metadata (original invoice number,
 *           date, KSeF number if available, correction reason).
 * Stage 2: XML generation — build FA(3) XML via the builder.
 * Stage 3: Post-generation — validate XML against schema + business rules.
 *
 * Returns the full validation result including the generated XML (if successful)
 * and the correction type detection.
 */
export function serializeCorrectionInvoice(
  invoice: IssuedInvoiceWithItems,
): CorrectionValidationResult {
  const errors: XmlValidationError[] = [];
  const warnings: XmlValidationError[] = [];

  const correctionType = detectCorrectionType(invoice);

  // ── Stage 1: Pre-generation validation ──

  // Original invoice number must exist
  if (!invoice.corrected_invoice_number?.trim()) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'missing_corrected_invoice_number',
      element: 'corrected_invoice_number',
      message: 'Correction invoice must reference the original invoice number (corrected_invoice_number)',
    });
  }

  // Original issue date must exist
  if (!invoice.corrected_invoice_date?.trim()) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'missing_corrected_invoice_date',
      element: 'corrected_invoice_date',
      message: 'Correction invoice must include the original invoice issue date (corrected_invoice_date)',
    });
  }

  // Correction reason should be present
  if (!invoice.correction_reason?.trim()) {
    warnings.push({
      category: 'business',
      severity: 'warning',
      rule: 'missing_correction_reason',
      element: 'correction_reason',
      message: 'Correction invoice should include a correction reason (PrzyczynaKorekty)',
    });
  }

  // Must have at least one line item
  if (!invoice.items || invoice.items.length === 0) {
    errors.push({
      category: 'business',
      severity: 'error',
      rule: 'no_line_items',
      element: 'items',
      message: 'Correction invoice must contain at least one correction line item',
    });
  }

  // If pre-generation validation fails, don't generate XML
  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
      correctionType,
      xmlValidation: null,
      rawXml: null,
    };
  }

  // ── Stage 2: XML generation ──
  let rawXml: string;
  try {
    rawXml = buildFa2Xml(invoice);
  } catch (err) {
    errors.push({
      category: 'schema',
      severity: 'error',
      rule: 'xml_generation_failed',
      message: `XML generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    });
    return {
      valid: false,
      errors,
      warnings,
      correctionType,
      xmlValidation: null,
      rawXml: null,
    };
  }

  // ── Stage 3: Post-generation validation ──
  const xmlValidation = validateFa3Xml(rawXml, invoice);

  return {
    valid: xmlValidation.valid && errors.length === 0,
    errors: [...errors, ...xmlValidation.errors],
    warnings: [...warnings, ...xmlValidation.warnings],
    correctionType,
    xmlValidation,
    rawXml,
  };
}
