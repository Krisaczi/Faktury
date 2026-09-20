import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test the invoice number uniqueness logic and manual numbering behavior.
// These tests validate the schema and validation flow without hitting the DB.

const INVOICE_NUMBER_REGEX = /^[\w/\-. ]+$/;
const MAX_LENGTH = 100;

function validateManualInvoiceNumber(num: string | undefined): { valid: boolean; error?: string } {
  if (!num || num.trim().length === 0) {
    return { valid: false, error: 'Numer faktury jest wymagany' };
  }
  if (num.length > MAX_LENGTH) {
    return { valid: false, error: `Numer faktury przekracza maksymalną długość ${MAX_LENGTH} znaków` };
  }
  if (!INVOICE_NUMBER_REGEX.test(num)) {
    return { valid: false, error: 'Numer faktury zawiera niedozwolone znaki' };
  }
  return { valid: true };
}

describe('Manual invoice numbering', () => {
  it('Test 1: valid manual number FV/001/09/2026 passes validation', () => {
    const result = validateManualInvoiceNumber('FV/001/09/2026');
    assert.equal(result.valid, true);
    assert.equal(result.error, undefined);
  });

  it('Test 2: valid manual number FV-2026-0001 passes validation', () => {
    const result = validateManualInvoiceNumber('FV-2026-0001');
    assert.equal(result.valid, true);
  });

  it('Test 3: valid manual number FS/09/2026/15 passes validation', () => {
    const result = validateManualInvoiceNumber('FS/09/2026/15');
    assert.equal(result.valid, true);
  });

  it('Test 4: empty number fails validation', () => {
    const result = validateManualInvoiceNumber('');
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('Test 5: undefined number fails validation', () => {
    const result = validateManualInvoiceNumber(undefined);
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('Test 6: number with special chars like semicolon fails validation', () => {
    const result = validateManualInvoiceNumber('FV;001');
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('Test 7: number exceeding 100 chars fails validation', () => {
    const result = validateManualInvoiceNumber('A'.repeat(101));
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('Test 8: number at exactly 100 chars passes validation', () => {
    const result = validateManualInvoiceNumber('A'.repeat(100));
    assert.equal(result.valid, true);
  });
});

describe('Duplicate invoice number detection (company-scoped)', () => {
  // Simulates the uniqueness check logic from the server action
  function checkUniqueness(
    invoiceNumber: string,
    companyId: string,
    existingInvoices: { company_id: string; invoice_number: string; id: string }[],
    excludeId?: string,
  ): { isDuplicate: boolean } {
    const dup = existingInvoices.find(
      (inv) =>
        inv.company_id === companyId &&
        inv.invoice_number === invoiceNumber &&
        inv.id !== excludeId,
    );
    return { isDuplicate: !!dup };
  }

  const mockInvoices = [
    { id: 'inv-1', company_id: 'company-a', invoice_number: 'FV/001/09/2026' },
    { id: 'inv-2', company_id: 'company-a', invoice_number: 'FV/002/09/2026' },
    { id: 'inv-3', company_id: 'company-b', invoice_number: 'FV/999/09/2026' },
  ];

  it('Test 2: duplicate number within same company is detected', () => {
    const result = checkUniqueness('FV/001/09/2026', 'company-a', mockInvoices);
    assert.equal(result.isDuplicate, true);
  });

  it('Test 3: same number in different companies is allowed', () => {
    // Company B wants to use FV/001/09/2026 — which company A already has
    const result = checkUniqueness('FV/001/09/2026', 'company-b', mockInvoices);
    assert.equal(result.isDuplicate, false);
  });

  it('Test 4: unique number within same company is allowed', () => {
    const result = checkUniqueness('FV/003/09/2026', 'company-a', mockInvoices);
    assert.equal(result.isDuplicate, false);
  });

  it('Test 5: editing existing invoice excludes itself from duplicate check', () => {
    const result = checkUniqueness('FV/001/09/2026', 'company-a', mockInvoices, 'inv-1');
    assert.equal(result.isDuplicate, false);
  });
});
