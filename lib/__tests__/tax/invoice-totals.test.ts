import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeItemAmounts,
  computeInvoiceTotals,
} from '../../../types/issued-invoice.ts';
import { computeTax } from '../../tax-calc.ts';

describe('computeItemAmounts', () => {
  it('line 1: 280.00 net, 23% VAT → 344.40 gross', () => {
    const r = computeItemAmounts(1, 280, '23', null);
    assert.equal(r.net_amount, 280);
    assert.equal(r.vat_amount, 64.40);
    assert.equal(r.gross_amount, 344.40);
  });

  it('line 2: 50.00 net, 23% VAT → 61.50 gross', () => {
    const r = computeItemAmounts(1, 50, '23', null);
    assert.equal(r.net_amount, 50);
    assert.equal(r.vat_amount, 11.50);
    assert.equal(r.gross_amount, 61.50);
  });

  it('applies discount before VAT', () => {
    const r = computeItemAmounts(2, 100, '23', 10);
    assert.equal(r.net_amount, 180);
    assert.equal(r.vat_amount, 41.40);
    assert.equal(r.gross_amount, 221.40);
  });

  it('handles 0% VAT', () => {
    const r = computeItemAmounts(1, 200, '0', null);
    assert.equal(r.net_amount, 200);
    assert.equal(r.vat_amount, 0);
    assert.equal(r.gross_amount, 200);
  });
});

describe('computeInvoiceTotals', () => {
  it('two 23% lines → 330.00 net, 75.90 VAT, 405.90 gross', () => {
    const items = [
      computeItemAmounts(1, 280, '23', null),
      computeItemAmounts(1, 50, '23', null),
    ];
    const totals = computeInvoiceTotals(items);
    assert.equal(totals.net_total, 330);
    assert.equal(totals.vat_total, 75.90);
    assert.equal(totals.gross_total, 405.90);
  });

  it('net + vat === gross (invariant)', () => {
    const items = [
      computeItemAmounts(1, 280, '23', null),
      computeItemAmounts(1, 50, '23', null),
    ];
    const totals = computeInvoiceTotals(items);
    assert.ok(Math.abs(totals.net_total + totals.vat_total - totals.gross_total) < 0.01);
  });

  it('multiple VAT rates: 100@23% + 200@8% + 50@5%', () => {
    const items = [
      computeItemAmounts(1, 100, '23', null),
      computeItemAmounts(1, 200, '8', null),
      computeItemAmounts(1, 50, '5', null),
    ];
    const totals = computeInvoiceTotals(items);
    assert.equal(totals.net_total, 350);
    assert.equal(totals.vat_total, 23 + 16 + 2.50);
    assert.equal(totals.gross_total, 350 + 23 + 16 + 2.50);
  });
});

describe('computeTax (platform invoices)', () => {
  it('exclusive: 280@23% + 50@23% → 33000 net, 7590 vat, 40590 total', () => {
    const r = computeTax(
      [
        { description: 'A', quantity: 1, unitPriceCents: 28000, taxable: true },
        { description: 'B', quantity: 1, unitPriceCents: 5000, taxable: true },
      ],
      23,
      false,
    );
    assert.equal(r.subtotalCents, 33000);
    assert.equal(r.taxTotalCents, 7590);
    assert.equal(r.totalCents, 40590);
    assert.equal(r.lineItems[0].taxBaseCents, 28000);
    assert.equal(r.lineItems[0].taxAmountCents, 6440);
    assert.equal(r.lineItems[1].taxBaseCents, 5000);
    assert.equal(r.lineItems[1].taxAmountCents, 1150);
  });

  it('inclusive: 344.40 gross @ 23% → 280 net, 64.40 vat', () => {
    const r = computeTax(
      [{ description: 'A', quantity: 1, unitPriceCents: 34440, taxable: true }],
      23,
      true,
    );
    assert.equal(r.subtotalCents, 28000);
    assert.equal(r.taxTotalCents, 6440);
    assert.equal(r.totalCents, 34440);
  });

  it('subtotal + taxTotal === total (invariant)', () => {
    const r = computeTax(
      [
        { description: 'A', quantity: 1, unitPriceCents: 28000, taxable: true },
        { description: 'B', quantity: 1, unitPriceCents: 5000, taxable: true },
      ],
      23,
      false,
    );
    assert.equal(r.subtotalCents + r.taxTotalCents, r.totalCents);
  });
});
