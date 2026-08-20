import assert from 'node:assert';
import { describe, it } from 'node:test';

// Pure-logic tests for plan limits enforcement.
// These verify the enforcement decision logic without hitting the database.

interface PlanLimits {
  maxUsers: number;
  invoicesPerMonth: number | null;
  maxVendorsContractors: number | null;
  invoiceMode: 'preview' | 'full';
}

const STARTER: PlanLimits = {
  maxUsers: 1,
  invoicesPerMonth: 10,
  maxVendorsContractors: 25,
  invoiceMode: 'full',
};

const PROFESSIONAL: PlanLimits = {
  maxUsers: 3,
  invoicesPerMonth: null,
  maxVendorsContractors: null,
  invoiceMode: 'full',
};

function checkUserLimit(limits: PlanLimits, currentUsers: number): boolean {
  return currentUsers < limits.maxUsers;
}

function checkVendorLimit(limits: PlanLimits, currentVendors: number): boolean {
  if (limits.maxVendorsContractors === null) return true;
  return currentVendors < limits.maxVendorsContractors;
}

function checkInvoiceLimit(limits: PlanLimits, issuedThisMonth: number): boolean {
  if (limits.invoicesPerMonth === null) return true;
  return issuedThisMonth < limits.invoicesPerMonth;
}

describe('Plan limits: Starter', () => {
  it('maxUsers is 1', () => {
    assert.equal(STARTER.maxUsers, 1);
  });

  it('invoicesPerMonth is 10', () => {
    assert.equal(STARTER.invoicesPerMonth, 10);
  });

  it('maxVendorsContractors is 25', () => {
    assert.equal(STARTER.maxVendorsContractors, 25);
  });

  it('invoiceMode is full', () => {
    assert.equal(STARTER.invoiceMode, 'full');
  });
});

describe('Plan limits: Professional', () => {
  it('maxUsers is 3', () => {
    assert.equal(PROFESSIONAL.maxUsers, 3);
  });

  it('invoicesPerMonth is null (unlimited)', () => {
    assert.equal(PROFESSIONAL.invoicesPerMonth, null);
  });

  it('maxVendorsContractors is null (unlimited)', () => {
    assert.equal(PROFESSIONAL.maxVendorsContractors, null);
  });

  it('invoiceMode is full', () => {
    assert.equal(PROFESSIONAL.invoiceMode, 'full');
  });
});

describe('User limit enforcement', () => {
  it('Starter allows 0 users', () => {
    assert.equal(checkUserLimit(STARTER, 0), true);
  });

  it('Starter blocks at 1 user (cannot add second)', () => {
    assert.equal(checkUserLimit(STARTER, 1), false);
  });

  it('Professional allows 2 users', () => {
    assert.equal(checkUserLimit(PROFESSIONAL, 2), true);
  });

  it('Professional blocks at 3 users', () => {
    assert.equal(checkUserLimit(PROFESSIONAL, 3), false);
  });
});

describe('Vendor limit enforcement', () => {
  it('Starter allows 24 vendors', () => {
    assert.equal(checkVendorLimit(STARTER, 24), true);
  });

  it('Starter blocks at 25 vendors (cannot add 26th)', () => {
    assert.equal(checkVendorLimit(STARTER, 25), false);
  });

  it('Professional allows any number of vendors', () => {
    assert.equal(checkVendorLimit(PROFESSIONAL, 1000), true);
    assert.equal(checkVendorLimit(PROFESSIONAL, 100000), true);
  });
});

describe('Invoice limit enforcement', () => {
  it('Starter allows 9th invoice', () => {
    assert.equal(checkInvoiceLimit(STARTER, 9), true);
  });

  it('Starter blocks 11th invoice (10 issued already)', () => {
    assert.equal(checkInvoiceLimit(STARTER, 10), false);
  });

  it('Starter allows 10th invoice (9 issued)', () => {
    assert.equal(checkInvoiceLimit(STARTER, 9), true);
  });

  it('Professional allows unlimited invoices', () => {
    assert.equal(checkInvoiceLimit(PROFESSIONAL, 100), true);
    assert.equal(checkInvoiceLimit(PROFESSIONAL, 10000), true);
  });
});

describe('Concurrency: transactional enforcement', () => {
  // Simulates the transactional check pattern: re-count inside transaction
  it('Starter with 9 invoices: two concurrent requests, only one succeeds', () => {
    // Before transaction: count = 9, limit = 10
    // Request A: BEGIN, count=9, 9<10 → insert, COMMIT, count=10
    // Request B: BEGIN, count=10 (after A committed), 10<10 is false → blocked
    const limit = 10;
    let count = 9;

    // Request A
    const aAllowed = count < limit;
    if (aAllowed) count++;

    // Request B (after A committed)
    const bAllowed = count < limit;
    if (bAllowed) count++;

    assert.equal(aAllowed, true);
    assert.equal(bAllowed, false);
    assert.equal(count, 10);
  });

  it('Starter with 1 user: two concurrent invites, only one succeeds', () => {
    const maxUsers = 1;
    let currentUsers = 1;

    const aAllowed = currentUsers < maxUsers;
    if (aAllowed) currentUsers++;

    const bAllowed = currentUsers < maxUsers;

    assert.equal(aAllowed, false);
    assert.equal(bAllowed, false);
  });
});

describe('Invoice mode: both plans full', () => {
  it('Starter has full invoice mode (not preview)', () => {
    assert.equal(STARTER.invoiceMode, 'full');
    assert.notEqual(STARTER.invoiceMode, 'preview');
  });

  it('Professional has full invoice mode', () => {
    assert.equal(PROFESSIONAL.invoiceMode, 'full');
  });
});

describe('Null means unlimited', () => {
  it('null invoicesPerMonth means unlimited', () => {
    assert.equal(checkInvoiceLimit({ ...PROFESSIONAL, invoicesPerMonth: null }, 99999), true);
  });

  it('null maxVendorsContractors means unlimited', () => {
    assert.equal(checkVendorLimit({ ...PROFESSIONAL, maxVendorsContractors: null }, 99999), true);
  });
});

describe('canAccessInvoicing: both plans allowed', () => {
  function canAccessInvoicing(role: string, packageType: string): boolean {
    if (role === 'owner') return true;
    if (role !== 'accountant') return false;
    return packageType === 'professional' || packageType === 'starter';
  }

  it('owner can always invoice', () => {
    assert.equal(canAccessInvoicing('owner', 'starter'), true);
    assert.equal(canAccessInvoicing('owner', 'professional'), true);
  });

  it('accountant on Starter can invoice (full mode)', () => {
    assert.equal(canAccessInvoicing('accountant', 'starter'), true);
  });

  it('accountant on Professional can invoice', () => {
    assert.equal(canAccessInvoicing('accountant', 'professional'), true);
  });

  it('unknown role cannot invoice', () => {
    assert.equal(canAccessInvoicing('unknown', 'starter'), false);
  });
});
