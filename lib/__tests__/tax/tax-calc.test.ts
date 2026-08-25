import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeTax, validateVatRate, VAT_PRESETS } from '../../tax-calc.ts';

describe('tax-calc', () => {

  describe('validateVatRate', () => {
    it('returns 0 for null/undefined', () => {
      assert.equal(validateVatRate(null), 0);
      assert.equal(validateVatRate(undefined), 0);
    });

    it('rounds to 2 decimal places', () => {
      assert.equal(validateVatRate(23.005), 23.01);
      assert.equal(validateVatRate(8), 8);
    });

    it('throws for out-of-bounds rates', () => {
      assert.throws(() => validateVatRate(-1));
      assert.throws(() => validateVatRate(101));
      assert.throws(() => validateVatRate(NaN));
    });
  });

  describe('computeTax — tax-exclusive (priceIncludesTax=false)', () => {
    it('computes 23% VAT on single line', () => {
      const result = computeTax(
        [{ description: 'Test', quantity: 1, unitPriceCents: 10000, taxable: true }],
        23,
        false,
      );
      assert.equal(result.subtotalCents, 10000);
      assert.equal(result.taxTotalCents, 2300);
      assert.equal(result.totalCents, 12300);
      assert.equal(result.lineItems[0].taxBaseCents, 10000);
      assert.equal(result.lineItems[0].taxAmountCents, 2300);
    });

    it('computes 0% VAT correctly', () => {
      const result = computeTax(
        [{ description: 'Test', quantity: 2, unitPriceCents: 5000, taxable: true }],
        0,
        false,
      );
      assert.equal(result.subtotalCents, 10000);
      assert.equal(result.taxTotalCents, 0);
      assert.equal(result.totalCents, 10000);
    });

    it('handles non-taxable lines', () => {
      const result = computeTax(
        [{ description: 'Tax-free', quantity: 1, unitPriceCents: 5000, taxable: false }],
        23,
        false,
      );
      assert.equal(result.subtotalCents, 5000);
      assert.equal(result.taxTotalCents, 0);
      assert.equal(result.totalCents, 5000);
      assert.equal(result.lineItems[0].vatRatePercent, 0);
    });

    it('computes per-line VAT with different rates', () => {
      const result = computeTax(
        [
          { description: 'A', quantity: 1, unitPriceCents: 10000, taxable: true, vatRatePercent: 23 },
          { description: 'B', quantity: 1, unitPriceCents: 10000, taxable: true, vatRatePercent: 8 },
        ],
        23,
        false,
      );
      assert.equal(result.taxTotalCents, 3100);
      assert.equal(result.breakdown.length, 2);
      assert.equal(result.breakdown[0].vatRatePercent, 23);
      assert.equal(result.breakdown[0].taxAmountCents, 2300);
      assert.equal(result.breakdown[1].vatRatePercent, 8);
      assert.equal(result.breakdown[1].taxAmountCents, 800);
    });

    it('falls back to invoice-level rate when line rate is null', () => {
      const result = computeTax(
        [{ description: 'A', quantity: 1, unitPriceCents: 10000, taxable: true, vatRatePercent: null }],
        8,
        false,
      );
      assert.equal(result.lineItems[0].vatRatePercent, 8);
      assert.equal(result.lineItems[0].taxAmountCents, 800);
    });
  });

  describe('computeTax — tax-inclusive (priceIncludesTax=true)', () => {
    it('reverses 23% VAT from inclusive price', () => {
      const result = computeTax(
        [{ description: 'Test', quantity: 1, unitPriceCents: 12300, taxable: true }],
        23,
        true,
      );
      assert.equal(result.lineItems[0].taxBaseCents, 10000);
      assert.equal(result.lineItems[0].taxAmountCents, 2300);
      assert.equal(result.subtotalCents, 10000);
      assert.equal(result.taxTotalCents, 2300);
      assert.equal(result.totalCents, 12300);
    });

    it('handles 0% inclusive (no change)', () => {
      const result = computeTax(
        [{ description: 'Test', quantity: 1, unitPriceCents: 10000, taxable: true }],
        0,
        true,
      );
      assert.equal(result.lineItems[0].taxBaseCents, 10000);
      assert.equal(result.lineItems[0].taxAmountCents, 0);
    });
  });

  describe('breakdown aggregation', () => {
    it('aggregates same-rate lines into one breakdown entry', () => {
      const result = computeTax(
        [
          { description: 'A', quantity: 1, unitPriceCents: 10000, taxable: true, vatRatePercent: 23 },
          { description: 'B', quantity: 1, unitPriceCents: 5000, taxable: true, vatRatePercent: 23 },
        ],
        23,
        false,
      );
      assert.equal(result.breakdown.length, 1);
      assert.equal(result.breakdown[0].vatRatePercent, 23);
      assert.equal(result.breakdown[0].taxBaseCents, 15000);
      assert.equal(result.breakdown[0].taxAmountCents, 3450);
    });
  });

  describe('VAT_PRESETS', () => {
    it('contains common Polish VAT rates', () => {
      assert.ok(VAT_PRESETS.includes(0));
      assert.ok(VAT_PRESETS.includes(5));
      assert.ok(VAT_PRESETS.includes(8));
      assert.ok(VAT_PRESETS.includes(23));
    });
  });

  describe('source code checks for API endpoints', () => {
    it('draft API accepts VAT params and computes tax server-side', async () => {
      const { readFile } = await import('node:fs/promises');
      const { join, dirname } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const src = await readFile(join(projectRoot, 'app/api/owner/invoices/draft/route.ts'), 'utf8');
      assert.ok(src.includes('computeTax'), 'must use computeTax server-side');
      assert.ok(src.includes('vatRate'), 'must accept vatRate param');
      assert.ok(src.includes('vatMode'), 'must accept vatMode param');
      assert.ok(src.includes('priceIncludesTax'), 'must accept priceIncludesTax');
      assert.ok(src.includes('vatNumber'), 'must accept vatNumber');
      assert.ok(src.includes('tax_breakdown'), 'must persist tax_breakdown');
      assert.ok(src.includes('vat_rate_percent'), 'must persist vat_rate_percent');
      assert.ok(src.includes('tax_total_cents'), 'must persist tax_total_cents');
    });

    it('issue API persists immutable tax snapshot', async () => {
      const { readFile } = await import('node:fs/promises');
      const { join, dirname } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const src = await readFile(join(projectRoot, 'app/api/owner/invoices/[id]/issue/route.ts'), 'utf8');
      assert.ok(src.includes('tax_snapshot_taken_at'), 'must set tax_snapshot_taken_at');
      assert.ok(src.includes('tax_snapshot_created'), 'must audit tax_snapshot_created');
      assert.ok(src.includes('taxSnapshot'), 'must return tax snapshot in response');
    });

    it('preview API returns tax fields', async () => {
      const { readFile } = await import('node:fs/promises');
      const { join, dirname } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const src = await readFile(join(projectRoot, 'app/api/owner/invoices/[id]/preview/route.ts'), 'utf8');
      assert.ok(src.includes('vatRatePercent'), 'must return vatRatePercent');
      assert.ok(src.includes('vatNumber'), 'must return vatNumber');
      assert.ok(src.includes('taxBreakdown'), 'must return taxBreakdown');
      assert.ok(src.includes('priceIncludesTax'), 'must return priceIncludesTax');
    });

    it('tax-config endpoint exists and is owner-only', async () => {
      const { readFile } = await import('node:fs/promises');
      const { join, dirname } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const src = await readFile(join(projectRoot, 'app/api/owner/companies/[id]/tax-config/route.ts'), 'utf8');
      assert.ok(src.includes("role !== 'owner'"), 'must enforce owner-only');
      assert.ok(src.includes('company_tax_config'), 'must use company_tax_config table');
      assert.ok(src.includes('defaultVatRate'), 'must return defaultVatRate');
      assert.ok(src.includes('defaultVatNumber'), 'must return defaultVatNumber');
    });

    it('tax-audit endpoint exists and is owner-only', async () => {
      const { readFile } = await import('node:fs/promises');
      const { join, dirname } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const src = await readFile(join(projectRoot, 'app/api/owner/invoices/[id]/tax-audit/route.ts'), 'utf8');
      assert.ok(src.includes("role !== 'owner'"), 'must enforce owner-only');
      assert.ok(src.includes('tax_snapshot_created'), 'must filter tax actions');
      assert.ok(src.includes('tax_rate_changed'), 'must filter tax actions');
      assert.ok(src.includes('vat_number_set'), 'must filter tax actions');
      assert.ok(src.includes('tax_override_used'), 'must filter tax actions');
    });

    it('modal has VAT controls', async () => {
      const { readFile } = await import('node:fs/promises');
      const { join, dirname } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const src = await readFile(join(projectRoot, 'components/admin/platform-invoice-modal.tsx'), 'utf8');
      assert.ok(src.includes('vatRate'), 'must have VAT rate state');
      assert.ok(src.includes('customVatRate'), 'must support custom VAT rate');
      assert.ok(src.includes('vatMode'), 'must have VAT mode toggle');
      assert.ok(src.includes('priceIncludesTax'), 'must have inclusive/exclusive toggle');
      assert.ok(src.includes('vatNumber'), 'must have VAT number field');
      assert.ok(src.includes('vatConfirmed'), 'must require owner confirmation');
      assert.ok(src.includes('computeTax'), 'must use server-aligned tax computation');
      assert.ok(src.includes('VAT_PRESETS'), 'must use VAT presets');
      assert.ok(src.includes('tax-config'), 'must fetch company tax config');
    });
  });
});
