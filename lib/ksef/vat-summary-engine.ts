/**
 * VAT Summary Engine — dynamically computes the P_13_* summary section
 * from correction line items.
 *
 * This module is the single source of truth for:
 * - Which P_13_* fields are emitted (only categories that actually exist)
 * - Which P_14_* fields are emitted (only taxable rates with VAT amounts)
 * - P_13_9 (total net) = sum of all per-rate net totals
 * - P_15 (total gross) = P_13_9 + sum of all P_14_* VAT amounts
 * - Zero-net categories are never emitted
 *
 * No P_13 field is hardcoded — every field is derived from the line items
 * via the P13_FIELDS schema definition.
 */

import type { VatRate } from '@/types/issued-invoice';
import type { IssuedInvoiceWithItems } from '@/types/issued-invoice';
import { P13_FIELDS, P14_FIELDS, perRateP13Elements, faElementPosition } from './fa3-schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VatLineTrace {
  /** 1-based position of the source invoice line item. */
  linePosition:    number;
  /** Name/description of the source line item. */
  lineName:        string;
  /** Raw vat_rate value from the line item. */
  rawRate:         string;
  /** Net amount from this line. */
  netAmount:       number;
  /** VAT amount from this line. */
  vatAmount:       number;
}

export interface VatCategoryGroup {
  /** Internal rate code (e.g. '23', '8', '0_kr', 'np'). */
  rate:        string;
  /** P_12 value (e.g. '23', '0 KR', 'np I'). */
  p12Value:    string;
  /** P_13 element name (e.g. 'P_13_1', 'P_13_6_1'). */
  p13Element:  string;
  /** P_14 element name, or null if this rate has no VAT. */
  p14Element:  string | null;
  /** Aggregated net total for this category. */
  netTotal:    number;
  /** Aggregated VAT total for this category. */
  vatTotal:    number;
  /** Aggregated gross total for this category. */
  grossTotal:  number;
  /** Position in the FA(3) element sequence. */
  order:       number;
  /** Business reason this category maps to its P_13 field. */
  businessReason:  string;
  /** Per-line-item traces that were aggregated into this group. */
  lineTraces:  VatLineTrace[];
}

export interface VatSummaryResult {
  /** Active categories (non-zero net), sorted by FA(3) element order. */
  groups:          VatCategoryGroup[];
  /** P_13_9 = total net = sum of all group netTotal. */
  p13_9:           number;
  /** P_15 = total gross = p13_9 + sum of all group vatTotal. */
  p15:             number;
  /** Sum of per-rate P_13 values (for validation: must equal p13_9). */
  p13Sum:          number;
  /** Sum of per-rate P_14 values (for validation: must equal total VAT). */
  p14Sum:          number;
  /** List of P_13 element names that will be emitted, in order. */
  emittedP13Fields: string[];
  /** List of P_14 element names that will be emitted, in order. */
  emittedP14Fields: string[];
  /** Rates detected in the line items (after aggregation). */
  detectedRates:   string[];
}

// ─── Engine ───────────────────────────────────────────────────────────────────

/**
 * Aggregate line items into VAT category groups.
 *
 * Rates that share a P_13 element (via `aggregatesWith`) are merged into
 * a single group. For example, np and np_ii both map to P_13_8, so their
 * net/vat/gross totals are combined.
 */
function aggregateItems(
  items: IssuedInvoiceWithItems['items'],
): Map<string, VatCategoryGroup> {
  const map = new Map<string, VatCategoryGroup>();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const rawRate = (item.vat_rate ?? '23') as string;
    const def = P13_FIELDS[rawRate];
    if (!def) continue;

    // Use the aggregation key (aggregatesWith) if defined, otherwise the raw rate
    const groupKey = def.aggregatesWith ?? rawRate;
    const groupDef = P13_FIELDS[groupKey] ?? def;

    const lineTrace: VatLineTrace = {
      linePosition: item.position ?? idx + 1,
      lineName:     item.name ?? `Line ${idx + 1}`,
      rawRate,
      netAmount:    item.net_amount,
      vatAmount:    item.vat_amount,
    };

    const existing = map.get(groupKey);
    if (existing) {
      existing.netTotal   += item.net_amount;
      existing.vatTotal   += item.vat_amount;
      existing.grossTotal += item.gross_amount;
      existing.lineTraces.push(lineTrace);
    } else {
      map.set(groupKey, {
        rate:           groupKey,
        p12Value:       groupDef.p12Value,
        p13Element:     groupDef.element,
        p14Element:     P14_FIELDS[groupKey] ?? null,
        netTotal:       item.net_amount,
        vatTotal:       item.vat_amount,
        grossTotal:     item.gross_amount,
        order:          groupDef.order,
        businessReason: groupDef.businessReason,
        lineTraces:     [lineTrace],
      });
    }
  }

  return map;
}

/**
 * Compute the VAT summary from correction line items.
 *
 * This function is the dynamic replacement for the old hardcoded
 * buildVatSummaryAndP15. It:
 *
 * 1. Aggregates line items by VAT category (with np/np_ii aggregation)
 * 2. Filters out zero-net categories (reversed-away rates produce no P_13 field)
 * 3. Computes P_13_9 = sum of all active group net totals
 * 4. Computes P_15 = P_13_9 + sum of all active group VAT totals
 * 5. Returns the ordered list of P_13/P_14 fields to emit
 *
 * P_15 is computed from line items, NOT taken from inv.gross_total.
 * This guarantees mathematical consistency: P_15 always equals
 * P_13_9 + SUM(P_14_*).
 */
export function computeVatSummary(
  items: IssuedInvoiceWithItems['items'],
): VatSummaryResult {
  const aggregated = aggregateItems(items);

  // Filter out zero-net groups — reversed-away categories must not appear
  const activeGroups = Array.from(aggregated.values())
    .filter(g => Math.round(g.netTotal * 100) / 100 !== 0)
    .sort((a, b) => a.order - b.order);

  // P_13_9 = total net = sum of all active group net totals
  const p13_9 = activeGroups.reduce((sum, g) => sum + g.netTotal, 0);

  // P_14 sum = total VAT = sum of all active group VAT totals
  const p14Sum = activeGroups.reduce((sum, g) => sum + g.vatTotal, 0);

  // P_15 = P_13_9 + P_14 sum (net + VAT = gross)
  const p15 = p13_9 + p14Sum;

  // P_13 sum = sum of per-rate P_13 values (must equal P_13_9)
  const p13Sum = p13_9;

  // Emitted P_13 fields in canonical order
  const emittedP13Fields: string[] = [];
  const seenP13 = new Set<string>();
  for (const g of activeGroups) {
    if (!seenP13.has(g.p13Element)) {
      seenP13.add(g.p13Element);
      emittedP13Fields.push(g.p13Element);
    }
  }
  emittedP13Fields.sort((a, b) => faElementPosition(a) - faElementPosition(b));

  // Emitted P_14 fields
  const emittedP14Fields: string[] = [];
  for (const g of activeGroups) {
    if (g.p14Element && Math.round(g.vatTotal * 100) / 100 !== 0) {
      emittedP14Fields.push(g.p14Element);
    }
  }

  // Detected rates (for diagnostics)
  const detectedRates = Array.from(aggregated.keys()).sort(
    (a, b) => (P13_FIELDS[a]?.order ?? 99) - (P13_FIELDS[b]?.order ?? 99),
  );

  return {
    groups:          activeGroups,
    p13_9:           Math.round(p13_9 * 100) / 100,
    p15:             Math.round(p15 * 100) / 100,
    p13Sum:          Math.round(p13Sum * 100) / 100,
    p14Sum:          Math.round(p14Sum * 100) / 100,
    emittedP13Fields,
    emittedP14Fields,
    detectedRates,
  };
}

/**
 * Generate the P_13/P_14/P_15 XML lines from a VAT summary.
 *
 * Each line is a complete XML element string (e.g. "    <P_13_1>1000.00</P_13_1>").
 * P_13_9 and P_15 are always emitted (required by FA(3)).
 */
export function buildVatSummaryXml(summary: VatSummaryResult): string[] {
  // Build all elements with their FA(3) sequence position, then sort.
  // This ensures P_13_10 (oo) appears AFTER P_13_9, per the FA(3) XSD.
  const elements: { pos: number; line: string }[] = [];

  for (const group of summary.groups) {
    elements.push({
      pos: faElementPosition(group.p13Element),
      line: `    <${group.p13Element}>${group.netTotal.toFixed(2)}</${group.p13Element}>`,
    });
    if (group.p14Element) {
      elements.push({
        pos: faElementPosition(group.p14Element),
        line: `    <${group.p14Element}>${group.vatTotal.toFixed(2)}</${group.p14Element}>`,
      });
    }
  }

  // P_13_9 = total net (required)
  elements.push({
    pos: faElementPosition('P_13_9'),
    line: `    <P_13_9>${summary.p13_9.toFixed(2)}</P_13_9>`,
  });

  // P_15 = total gross (required)
  elements.push({
    pos: faElementPosition('P_15'),
    line: `    <P_15>${summary.p15.toFixed(2)}</P_15>`,
  });

  return elements
    .sort((a, b) => a.pos - b.pos)
    .map(e => e.line);
}

/**
 * Determine which VAT categories are "active" (positive net) for annotation
 * purposes. A correction that reverses away a category produces negative net;
 * that negative must NOT trigger reverse-charge or exemption flags.
 */
export function getActiveCategories(
  groups: VatCategoryGroup[],
): { hasExempt: boolean; hasReverseCharge: boolean; hasNonTaxable: boolean; hasZero: boolean } {
  const positive = groups.filter(g => Math.round(g.netTotal * 100) / 100 > 0);
  return {
    hasExempt:        positive.some(g => g.rate === 'zw'),
    hasReverseCharge: positive.some(g => g.rate === 'oo'),
    hasNonTaxable:    positive.some(g => g.rate === 'np' || g.rate === 'np_ii'),
    hasZero:          positive.some(g => g.rate === '0' || g.rate === '0_kr' || g.rate === '0_wdt' || g.rate === '0_ex'),
  };
}
