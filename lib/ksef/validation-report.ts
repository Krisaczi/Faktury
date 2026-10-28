/**
 * Pre-submission validation report generator.
 *
 * Produces a structured diagnostic report covering:
 * - Schema validation (element ordering, required fields, namespace)
 * - Business validation (VAT consistency, annotation compatibility)
 * - Mathematical validation (P_15 = P_13_9 + SUM(P_14_*))
 * - Correction validation (reference invoice, reason)
 * - VAT mapping validation (only present categories emitted)
 * - Payment validation (due date, Rozliczenie match)
 *
 * Used by the owner diagnostics panel and as the KSeF submission gate.
 */

import type { IssuedInvoiceWithItems } from '@/types/issued-invoice';
import type { VatRate, DocumentType } from '@/types/issued-invoice';
import { validateFa3Xml, type XmlValidationResult } from './xml-validator';
import { computeVatSummary, getActiveCategories, type VatSummaryResult } from './vat-summary-engine';
import { perRateP13Elements, P13_FIELDS, VALID_P12_VALUES } from './fa3-schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CheckStatus = 'pass' | 'fail' | 'warning';

export interface ValidationSectionResult {
  name:    string;
  status:  CheckStatus;
  checks:  ValidationDetailCheck[];
}

export interface ValidationDetailCheck {
  name:    string;
  status:  CheckStatus;
  message: string;
  detail?: string;
}

export interface PreSubmissionReport {
  overallStatus:        'ready' | 'blocked' | 'warning';
  xmlValidation:        XmlValidationResult;
  vatSummary:           VatSummaryResult;
  sections:             ValidationSectionResult[];
  generatedXml:         string;
  detectedVatCategories: string[];
  emittedP13Fields:     string[];
  emittedP14Fields:     string[];
  computedP13_9:        number;
  computedP15:          number;
  invoiceNetTotal:      number;
  invoiceGrossTotal:    number;
  mathConsistent:       boolean;
  readyForKsef:         boolean;
}

// ─── Report builder ───────────────────────────────────────────────────────────

export function generateValidationReport(
  xml: string,
  invoice: IssuedInvoiceWithItems,
  xmlValidation: XmlValidationResult,
): PreSubmissionReport {
  const items = invoice.items ?? [];
  const summary = computeVatSummary(items);
  const activeCats = getActiveCategories(summary.groups);
  const docType = (invoice.document_type ?? 'STANDARD') as DocumentType;

  const sections: ValidationSectionResult[] = [];

  // ── Section 1: Schema Validation ──
  const schemaChecks: ValidationDetailCheck[] = [];
  const schemaErrors = xmlValidation.schemaErrors;
  schemaChecks.push({
    name: 'XML Declaration & Namespace',
    status: schemaErrors.some(e => e.rule === 'xml_declaration' || e.rule === 'namespace') ? 'fail' : 'pass',
    message: schemaErrors.some(e => e.rule === 'xml_declaration') ? 'Missing XML declaration' : 'XML declaration present',
  });
  schemaChecks.push({
    name: 'Root Element <Faktura>',
    status: schemaErrors.some(e => e.rule === 'root_element') ? 'fail' : 'pass',
    message: schemaErrors.some(e => e.rule === 'root_element') ? 'Missing <Faktura> root' : 'Root element present',
  });
  schemaChecks.push({
    name: 'Required Elements',
    status: schemaErrors.some(e => e.rule === 'required_element') ? 'fail' : 'pass',
    message: schemaErrors.some(e => e.rule === 'required_element')
      ? `Missing: ${schemaErrors.filter(e => e.rule === 'required_element').map(e => e.element).join(', ')}`
      : 'All required elements present',
  });
  schemaChecks.push({
    name: 'Element Ordering',
    status: schemaErrors.some(e => e.rule === 'element_order') ? 'fail' : 'pass',
    message: schemaErrors.some(e => e.rule === 'element_order')
      ? `Ordering errors: ${schemaErrors.filter(e => e.rule === 'element_order').map(e => e.element).join(', ')}`
      : 'Element ordering valid',
  });
  schemaChecks.push({
    name: 'P_12 VAT Rate Codes',
    status: schemaErrors.some(e => e.rule === 'invalid_vat_rate') ? 'fail' : 'pass',
    message: schemaErrors.some(e => e.rule === 'invalid_vat_rate')
      ? `Invalid P_12 values detected`
      : `All P_12 values are valid (${VALID_P12_VALUES.length} accepted codes)`,
  });
  sections.push({
    name: 'Schema Validation',
    status: schemaErrors.length === 0 ? 'pass' : 'fail',
    checks: schemaChecks,
  });

  // ── Section 2: Business Validation ──
  const businessChecks: ValidationDetailCheck[] = [];
  const bizErrors = xmlValidation.businessErrors;
  const bizWarnings = xmlValidation.warnings;

  businessChecks.push({
    name: 'VAT Category Consistency',
    status: bizErrors.some(e => e.rule === 'contradictory_vat_categories' || e.rule === 'p18_p19_conflict') ? 'fail' : 'pass',
    message: bizErrors.some(e => e.rule === 'contradictory_vat_categories')
      ? 'Contradictory VAT categories detected (exempt + reverse charge)'
      : bizErrors.some(e => e.rule === 'p18_p19_conflict')
        ? 'P_18 and P_19 conflict detected'
        : 'VAT categories are consistent',
  });
  businessChecks.push({
    name: 'Annotation Compatibility (P_18/P_19)',
    status: bizErrors.some(e => e.rule.startsWith('invalid_p18') || e.rule === 'p18_p19_conflict' || e.rule === 'missing_p18') ? 'fail' : 'pass',
    message: bizErrors.some(e => e.rule.startsWith('invalid_p18') || e.rule === 'p18_p19_conflict')
      ? 'Invalid P_18/P_19 annotation combination'
      : 'Annotations are compatible',
  });
  businessChecks.push({
    name: 'Negative P_9A Check',
    status: bizErrors.some(e => e.rule === 'negative_p9a') ? 'fail' : 'pass',
    message: bizErrors.some(e => e.rule === 'negative_p9a')
      ? 'Negative unit prices detected in P_9A'
      : 'All P_9A values are non-negative',
  });
  businessChecks.push({
    name: 'Spurious P_13 Fields',
    status: bizErrors.some(e => e.rule === 'spurious_p13_field') ? 'fail' : 'pass',
    message: bizErrors.some(e => e.rule === 'spurious_p13_field')
      ? 'P_13 fields emitted for rates not present in invoice'
      : 'No spurious P_13 fields',
  });
  businessChecks.push({
    name: 'Zero-Value P_13 Fields',
    status: bizErrors.some(e => e.rule === 'zero_value_p13_field') ? 'fail' : 'pass',
    message: bizErrors.some(e => e.rule === 'zero_value_p13_field')
      ? 'Zero-value P_13 fields detected (reversed categories should be omitted)'
      : 'No zero-value P_13 fields',
  });
  sections.push({
    name: 'Business Validation',
    status: bizErrors.length === 0 ? 'pass' : 'fail',
    checks: businessChecks,
  });

  // ── Section 3: Mathematical Validation ──
  const mathChecks: ValidationDetailCheck[] = [];
  const p13SumMatches = xmlValidation.summaryCheck?.consistent ?? false;
  const p15Diff = Math.round((summary.p15 - (invoice.gross_total ?? 0)) * 100) / 100;

  mathChecks.push({
    name: 'SUM(P_13_*) = P_13_9',
    status: xmlValidation.errors.some(e => e.rule === 'summary_p13_9_mismatch') ? 'fail' : 'pass',
    message: `SUM(P_13_*) = ${summary.p13Sum.toFixed(2)}, P_13_9 = ${summary.p13_9.toFixed(2)}`,
  });
  mathChecks.push({
    name: 'P_15 = P_13_9 + SUM(P_14_*)',
    status: xmlValidation.errors.some(e => e.rule === 'summary_p15_mismatch') ? 'fail' : 'pass',
    message: `P_15 = ${summary.p15.toFixed(2)}, P_13_9 + P_14 = ${(summary.p13_9 + summary.p14Sum).toFixed(2)}`,
    detail: `P_13_9=${summary.p13_9.toFixed(2)}, SUM(P_14_*)=${summary.p14Sum.toFixed(2)}`,
  });
  mathChecks.push({
    name: 'P_13_9 matches invoice net_total',
    status: xmlValidation.errors.some(e => e.rule === 'summary_net_total_mismatch') ? 'fail' : 'pass',
    message: `P_13_9 = ${summary.p13_9.toFixed(2)}, net_total = ${(invoice.net_total ?? 0).toFixed(2)}`,
  });
  mathChecks.push({
    name: 'P_15 matches invoice gross_total',
    status: xmlValidation.errors.some(e => e.rule === 'summary_gross_total_mismatch') ? 'fail' : 'pass',
    message: `P_15 = ${summary.p15.toFixed(2)}, gross_total = ${(invoice.gross_total ?? 0).toFixed(2)}`,
    detail: p15Diff !== 0 ? `Difference: ${p15Diff.toFixed(2)}` : undefined,
  });
  sections.push({
    name: 'Mathematical Validation',
    status: p13SumMatches && p15Diff === 0 ? 'pass' : 'fail',
    checks: mathChecks,
  });

  // ── Section 4: Correction Validation ──
  if (docType === 'CORRECTION') {
    const corrChecks: ValidationDetailCheck[] = [];
    const hasCorrectedNumber = !!invoice.corrected_invoice_number?.trim();
    const hasCorrectedDate = !!invoice.corrected_invoice_date?.trim();
    const hasReason = !!invoice.correction_reason?.trim();

    corrChecks.push({
      name: 'Original Invoice Number',
      status: hasCorrectedNumber ? 'pass' : 'fail',
      message: hasCorrectedNumber ? `Referenced: ${invoice.corrected_invoice_number}` : 'Missing corrected_invoice_number',
    });
    corrChecks.push({
      name: 'Original Invoice Date',
      status: hasCorrectedDate ? 'pass' : 'fail',
      message: hasCorrectedDate ? `Date: ${invoice.corrected_invoice_date}` : 'Missing corrected_invoice_date',
    });
    corrChecks.push({
      name: 'Correction Reason',
      status: hasReason ? 'pass' : 'warning',
      message: hasReason ? `Reason: ${invoice.correction_reason}` : 'Missing correction reason (PrzyczynaKorekty)',
    });
    corrChecks.push({
      name: 'DaneFaKorygowanej Element',
      status: bizErrors.some(e => e.rule === 'missing_corrected_invoice_ref') ? 'fail' : 'pass',
      message: bizErrors.some(e => e.rule === 'missing_corrected_invoice_ref')
        ? 'DaneFaKorygowanej missing from XML'
        : 'DaneFaKorygowanej present in XML',
    });
    sections.push({
      name: 'Correction Validation',
      status: corrChecks.some(c => c.status === 'fail') ? 'fail' : corrChecks.some(c => c.status === 'warning') ? 'warning' : 'pass',
      checks: corrChecks,
    });
  }

  // ── Section 5: VAT Mapping Validation ──
  const mappingChecks: ValidationDetailCheck[] = [];
  const allExpectedP13 = new Set(summary.emittedP13Fields);
  const perRateElems = perRateP13Elements();
  for (const elem of perRateElems) {
    if (allExpectedP13.has(elem)) {
      const group = summary.groups.find(g => g.p13Element === elem);
      mappingChecks.push({
        name: `${elem} (${group?.rate ?? '?'})`,
        status: 'pass',
        message: `Net: ${group?.netTotal.toFixed(2) ?? '0.00'}`,
      });
    }
  }
  mappingChecks.push({
    name: 'No spurious fields',
    status: bizErrors.some(e => e.rule === 'spurious_p13_field') ? 'fail' : 'pass',
    message: 'Only categories present in line items are emitted',
  });
  sections.push({
    name: 'VAT Mapping Validation',
    status: bizErrors.some(e => e.rule === 'spurious_p13_field' || e.rule === 'zero_value_p13_field') ? 'fail' : 'pass',
    checks: mappingChecks,
  });

  // ── Section 6: Payment Validation ──
  const paymentChecks: ValidationDetailCheck[] = [];
  paymentChecks.push({
    name: 'Due Date Format',
    status: bizErrors.some(e => e.rule === 'invalid_due_date') ? 'fail' : 'pass',
    message: invoice.due_date ? `Due: ${invoice.due_date}` : 'No due date set',
  });
  paymentChecks.push({
    name: 'Rozliczenie matches P_15',
    status: bizErrors.some(e => e.rule === 'rozliczenie_mismatch') ? 'fail' : 'pass',
    message: bizErrors.some(e => e.rule === 'rozliczenie_mismatch')
      ? 'Rozliczenie amount does not match P_15'
      : 'Rozliczenie consistent with P_15',
  });
  sections.push({
    name: 'Payment Validation',
    status: paymentChecks.some(c => c.status === 'fail') ? 'fail' : 'pass',
    checks: paymentChecks,
  });

  // ── Section 7: Optional Sections (NoweSrodkiTransportu / PMarzy) ──
  const optionalChecks: ValidationDetailCheck[] = [];
  const flags = invoice.specialProcedure;
  const expectsTransport = flags?.newMeansOfTransport === true;
  const expectsMargin = flags?.marginScheme === true;
  const hasTransportInXml = xml.includes('<NoweSrodkiTransportu');
  const hasMarginInXml = xml.includes('<PMarzy');

  optionalChecks.push({
    name: 'NoweSrodkiTransportu',
    status: hasTransportInXml && !expectsTransport ? 'fail' : 'pass',
    message: hasTransportInXml
      ? expectsTransport
        ? 'Emitted (new means of transport flag active)'
        : 'ERROR: Emitted without specialProcedure.newMeansOfTransport flag'
      : 'Skipped (not applicable)',
  });
  optionalChecks.push({
    name: 'PMarzy',
    status: hasMarginInXml && !expectsMargin ? 'fail' : 'pass',
    message: hasMarginInXml
      ? expectsMargin
        ? 'Emitted (margin scheme flag active)'
        : 'ERROR: Emitted without specialProcedure.marginScheme flag'
      : 'Skipped (not applicable)',
  });
  optionalChecks.push({
    name: 'Zwolnienie (P_19)',
    status: 'pass',
    message: activeCats.hasExempt ? 'Emitted (VAT exemption active)' : 'Not emitted (P_19N)',
  });
  sections.push({
    name: 'Optional Sections Generated',
    status: optionalChecks.some(c => c.status === 'fail') ? 'fail' : 'pass',
    checks: optionalChecks,
  });

  // ── Overall status ──
  const hasFail = sections.some(s => s.status === 'fail');
  const hasWarning = sections.some(s => s.status === 'warning');
  const overallStatus: 'ready' | 'blocked' | 'warning' = hasFail ? 'blocked' : hasWarning ? 'warning' : 'ready';
  const mathConsistent = !xmlValidation.errors.some(e =>
    e.rule === 'summary_p13_9_mismatch' ||
    e.rule === 'summary_p15_mismatch' ||
    e.rule === 'summary_net_total_mismatch' ||
    e.rule === 'summary_gross_total_mismatch',
  );

  return {
    overallStatus,
    xmlValidation,
    vatSummary: summary,
    sections,
    generatedXml: xml,
    detectedVatCategories: summary.detectedRates,
    emittedP13Fields: summary.emittedP13Fields,
    emittedP14Fields: summary.emittedP14Fields,
    computedP13_9: summary.p13_9,
    computedP15: summary.p15,
    invoiceNetTotal: invoice.net_total ?? 0,
    invoiceGrossTotal: invoice.gross_total ?? 0,
    mathConsistent,
    readyForKsef: overallStatus !== 'blocked' && xmlValidation.valid,
  };
}
