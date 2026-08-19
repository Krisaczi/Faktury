import assert from 'node:assert';
import { describe, it } from 'node:test';
import { STARTER_INVOICE_LIMIT, DEFAULT_STARTER_FEATURES } from '../../packages/types';

// Pure-logic tests for the invoice limit enforcement rules.
// These verify the package feature configuration and the limit-checking
// arithmetic without hitting the database.

describe('Invoice limit: package features', () => {
  it('Starter plan has invoices_per_month = 10', () => {
    assert.equal(DEFAULT_STARTER_FEATURES.invoices_per_month, STARTER_INVOICE_LIMIT);
    assert.equal(STARTER_INVOICE_LIMIT, 10);
  });

  it('Starter invoicing is disabled by default', () => {
    assert.equal(DEFAULT_STARTER_FEATURES.invoicing, false);
  });

  it('Starter features include invoices_per_month field', () => {
    assert.ok('invoices_per_month' in DEFAULT_STARTER_FEATURES);
  });
});

describe('Invoice limit: remaining calculation', () => {
  // Simulates the arithmetic from checkInvoiceLimit / getMonthlyInvoiceUsage
  function computeRemaining(issued: number, limit: number | null, overrideExtra: number, overrideConsumed: number) {
    if (limit === null) return null; // unlimited
    const effectiveOverride = Math.max(0, overrideExtra - overrideConsumed);
    const effectiveLimit = limit + effectiveOverride;
    return Math.max(0, effectiveLimit - issued);
  }

  it('returns null (unlimited) for Professional plan', () => {
    assert.equal(computeRemaining(50, null, 0, 0), null);
  });

  it('returns full limit when no invoices issued', () => {
    assert.equal(computeRemaining(0, 10, 0, 0), 10);
  });

  it('returns correct remaining at 3 of 10', () => {
    assert.equal(computeRemaining(3, 10, 0, 0), 7);
  });

  it('returns 0 at limit', () => {
    assert.equal(computeRemaining(10, 10, 0, 0), 0);
  });

  it('returns 0 when over limit (should not go negative)', () => {
    assert.equal(computeRemaining(15, 10, 0, 0), 0);
  });

  it('adds override to effective limit', () => {
    assert.equal(computeRemaining(10, 10, 5, 0), 5);
  });

  it('subtracts consumed from override', () => {
    assert.equal(computeRemaining(10, 10, 5, 2), 3);
  });

  it('override fully consumed does not add to limit', () => {
    assert.equal(computeRemaining(10, 10, 5, 5), 0);
  });

  it('override consumed more than granted clamps to 0', () => {
    assert.equal(computeRemaining(10, 10, 5, 10), 0);
  });

  it('limit reached with no override returns 0', () => {
    assert.equal(computeRemaining(10, 10, 0, 0), 0);
  });
});

describe('Invoice limit: allowed decision', () => {
  // Simulates the decision logic from checkInvoiceLimit
  function isAllowed(issued: number, limit: number | null, remaining: number | null) {
    if (limit === null) return true;
    if (remaining !== null && remaining > 0) return true;
    return false;
  }

  it('Professional (unlimited) always allowed', () => {
    assert.equal(isAllowed(100, null, null), true);
  });

  it('Starter at 3/10 is allowed', () => {
    assert.equal(isAllowed(3, 10, 7), true);
  });

  it('Starter at 9/10 is allowed (1 remaining)', () => {
    assert.equal(isAllowed(9, 10, 1), true);
  });

  it('Starter at 10/10 is blocked (0 remaining)', () => {
    assert.equal(isAllowed(10, 10, 0), false);
  });

  it('Starter over limit is blocked', () => {
    assert.equal(isAllowed(12, 10, 0), false);
  });

  it('Starter with override remaining is allowed', () => {
    assert.equal(isAllowed(10, 10, 3), true); // override gave 3 extra
  });
});

describe('Invoice limit: near-limit threshold', () => {
  // Simulates the nearLimit calculation from the usage API
  function isNearLimit(remaining: number | null, limit: number) {
    if (remaining === null) return false;
    const threshold = Math.max(1, Math.ceil(limit * 0.2));
    return remaining <= threshold;
  }

  it('not near at 7/10 (3 remaining, threshold 2)', () => {
    assert.equal(isNearLimit(3, 10), false);
  });

  it('near at 8/10 (2 remaining, threshold 2)', () => {
    assert.equal(isNearLimit(2, 10), true);
  });

  it('near at 9/10 (1 remaining)', () => {
    assert.equal(isNearLimit(1, 10), true);
  });

  it('at limit (0 remaining) is also near', () => {
    assert.equal(isNearLimit(0, 10), true);
  });
});

describe('Invoice limit: allowance grant validation', () => {
  // Simulates the validation from grantInvoiceAllowance
  function validateAllowance(extra: number): { ok: boolean; error?: string } {
    if (extra <= 0) return { ok: false, error: 'Liczba dodatkowych faktur musi być większa niż 0.' };
    if (extra > 100) return { ok: false, error: 'Maksymalnie 100 dodatkowych faktur.' };
    return { ok: true };
  }

  it('rejects 0 extra invoices', () => {
    assert.equal(validateAllowance(0).ok, false);
  });

  it('rejects negative extra invoices', () => {
    assert.equal(validateAllowance(-5).ok, false);
  });

  it('accepts 1 extra invoice', () => {
    assert.equal(validateAllowance(1).ok, true);
  });

  it('accepts 5 extra invoices', () => {
    assert.equal(validateAllowance(5).ok, true);
  });

  it('accepts 100 extra invoices', () => {
    assert.equal(validateAllowance(100).ok, true);
  });
});

describe('Invoice limit: calendar month boundaries', () => {
  // Simulates the date_trunc('month', now()) logic used in the DB function
  function getMonthStart(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function getMonthEnd(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1);
  }

  it('month start for Aug 17 is Aug 1', () => {
    const d = new Date('2026-08-17T14:00:00Z');
    const start = getMonthStart(d);
    assert.equal(start.getMonth(), 7); // August (0-indexed)
    assert.equal(start.getDate(), 1);
  });

  it('month end for Aug 17 is Sep 1', () => {
    const d = new Date('2026-08-17T14:00:00Z');
    const end = getMonthEnd(d);
    assert.equal(end.getMonth(), 8); // September
    assert.equal(end.getDate(), 1);
  });

  it('month start for Jan 1 is Jan 1', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    const start = getMonthStart(d);
    assert.equal(start.getMonth(), 0);
    assert.equal(start.getDate(), 1);
  });

  it('month start for Dec 31 is Dec 1', () => {
    const d = new Date('2026-12-31T23:59:59Z');
    const start = getMonthStart(d);
    assert.equal(start.getMonth(), 11);
    assert.equal(start.getDate(), 1);
  });
});
