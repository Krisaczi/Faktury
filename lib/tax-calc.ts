export interface TaxLineInput {
  description:      string;
  quantity:         number;
  unitPriceCents:   number;
  taxable:          boolean;
  vatRatePercent?:  number | null;
}

export interface TaxLineResult {
  description:      string;
  quantity:         number;
  unitPriceCents:   number;
  amountCents:      number;
  taxable:          boolean;
  vatRatePercent:   number;
  taxBaseCents:     number;
  taxAmountCents:   number;
}

export interface TaxBreakdownLine {
  vatRatePercent: number;
  taxBaseCents:   number;
  taxAmountCents: number;
}

export interface TaxComputationResult {
  subtotalCents:    number;
  taxTotalCents:    number;
  totalCents:       number;
  lineItems:        TaxLineResult[];
  breakdown:        TaxBreakdownLine[];
  priceIncludesTax: boolean;
  vatRatePercent:   number;
}

export const VAT_PRESETS = [0, 5, 8, 23] as const;

export function validateVatRate(rate: number | null | undefined): number {
  if (rate === null || rate === undefined) return 0;
  const rounded = Math.round(rate * 100) / 100;
  if (isNaN(rounded) || rounded < 0 || rounded > 100) {
    throw new Error(`VAT rate must be between 0 and 100, got ${rate}`);
  }
  return rounded;
}

export function computeTax(
  lines:        TaxLineInput[],
  invoiceVatRate: number,
  priceIncludesTax: boolean,
): TaxComputationResult {
  const validatedInvoiceRate = validateVatRate(invoiceVatRate);
  let subtotalCents = 0;
  let taxTotalCents = 0;

  const lineResults: TaxLineResult[] = lines.map((item) => {
    const lineRate = item.vatRatePercent != null ? validateVatRate(item.vatRatePercent) : validatedInvoiceRate;
    const amountCents = Math.round(item.quantity * item.unitPriceCents);

    if (!item.taxable) {
      subtotalCents += amountCents;
      return {
        description:      item.description,
        quantity:         item.quantity,
        unitPriceCents:   item.unitPriceCents,
        amountCents,
        taxable:          false,
        vatRatePercent:   0,
        taxBaseCents:     amountCents,
        taxAmountCents:   0,
      };
    }

    const rateFraction = lineRate / 100;

    if (priceIncludesTax) {
      const taxBaseCents = Math.round(amountCents / (1 + rateFraction));
      const taxAmountCents = amountCents - taxBaseCents;
      subtotalCents += taxBaseCents;
      taxTotalCents += taxAmountCents;
      return {
        description:    item.description,
        quantity:       item.quantity,
        unitPriceCents: item.unitPriceCents,
        amountCents,
        taxable:        true,
        vatRatePercent: lineRate,
        taxBaseCents,
        taxAmountCents,
      };
    } else {
      const taxBaseCents = amountCents;
      const taxAmountCents = Math.round(amountCents * rateFraction);
      subtotalCents += taxBaseCents;
      taxTotalCents += taxAmountCents;
      return {
        description:    item.description,
        quantity:       item.quantity,
        unitPriceCents: item.unitPriceCents,
        amountCents,
        taxable:        true,
        vatRatePercent: lineRate,
        taxBaseCents,
        taxAmountCents,
      };
    }
  });

  const totalCents = subtotalCents + taxTotalCents;

  const breakdownMap = new Map<number, TaxBreakdownLine>();
  for (const li of lineResults) {
    if (!li.taxable) continue;
    const existing = breakdownMap.get(li.vatRatePercent);
    if (existing) {
      existing.taxBaseCents += li.taxBaseCents;
      existing.taxAmountCents += li.taxAmountCents;
    } else {
      breakdownMap.set(li.vatRatePercent, {
        vatRatePercent: li.vatRatePercent,
        taxBaseCents:   li.taxBaseCents,
        taxAmountCents: li.taxAmountCents,
      });
    }
  }

  return {
    subtotalCents,
    taxTotalCents,
    totalCents,
    lineItems:        lineResults,
    breakdown:        Array.from(breakdownMap.values()),
    priceIncludesTax,
    vatRatePercent:   validatedInvoiceRate,
  };
}
