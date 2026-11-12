import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateInvoiceRisk,
  isValidNip,
  normalizeNip,
  type RiskInvoice,
} from '../../risk/invoice-risk-rules';

const NIP = '5213256335';
const IBAN_A = 'PL02111111111111111111111111';
const IBAN_B = 'PL02999999999999999999999999';

function invoice(overrides: Partial<RiskInvoice> = {}): RiskInvoice {
  return {
    id: 'new',
    createdAt: '2026-11-12T10:00:00Z',
    invoiceNumber: 'FV 055/10/2026',
    invoiceDate: '2026-10-28',
    totalAmount: 50,
    sellerNip: NIP,
    sellerName: 'KrisAczi',
    bankAccount: IBAN_A,
    ...overrides,
  };
}

function ruleCodes(result: ReturnType<typeof evaluateInvoiceRisk>): string[] {
  return result.findings.map((f) => f.ruleCode);
}

describe('NIP validation', () => {
  it('normalizes spaces and dashes', () => {
    assert.equal(normalizeNip('521-325-63-35'), '5213256335');
    assert.equal(normalizeNip(' 521 325 63 35 '), '5213256335');
  });

  it('accepts a NIP with a valid checksum', () => {
    assert.equal(isValidNip(NIP), true);
  });

  it('rejects a NIP with a wrong checksum', () => {
    assert.equal(isValidNip('5213256336'), false);
  });

  it('rejects a NIP with fewer than 10 digits', () => {
    assert.equal(isValidNip('5213256'), false);
  });

  it('rejects non-numeric input', () => {
    assert.equal(isValidNip('52132563A5'), false);
  });
});

describe('duplicate invoice rule', () => {
  it('flags a later invoice matching NIP, number, date and amount', () => {
    const earlier = invoice({ id: 'old', createdAt: '2026-11-11T10:00:00Z' });
    const result = evaluateInvoiceRisk(invoice(), [earlier]);
    const finding = result.findings.find((f) => f.ruleCode === 'duplicate_invoice');
    assert.ok(finding);
    assert.equal(finding.severity, 'high');
    assert.deepEqual(finding.details.matchedInvoiceIds, ['old']);
  });

  it('does not flag the original invoice', () => {
    const later = invoice({ id: 'later', createdAt: '2026-11-13T10:00:00Z' });
    const result = evaluateInvoiceRisk(invoice({ createdAt: '2026-11-11T10:00:00Z' }), [later]);
    assert.equal(ruleCodes(result).includes('duplicate_invoice'), false);
  });

  it('does not flag when the amount differs', () => {
    const earlier = invoice({ id: 'old', totalAmount: 51, createdAt: '2026-11-11T10:00:00Z' });
    const result = evaluateInvoiceRisk(invoice(), [earlier]);
    assert.equal(ruleCodes(result).includes('duplicate_invoice'), false);
  });

  it('does not flag when the supplier NIP differs', () => {
    const earlier = invoice({ id: 'old', sellerNip: '1234563218', createdAt: '2026-11-11T10:00:00Z' });
    const result = evaluateInvoiceRisk(invoice(), [earlier]);
    assert.equal(ruleCodes(result).includes('duplicate_invoice'), false);
  });
});

describe('supplier bank account rule', () => {
  it('flags an IBAN never used by this supplier before', () => {
    const earlier = invoice({ id: 'old', bankAccount: IBAN_A, invoiceNumber: 'FV 1', createdAt: '2026-10-01T10:00:00Z' });
    const result = evaluateInvoiceRisk(invoice({ bankAccount: IBAN_B }), [earlier]);
    const finding = result.findings.find((f) => f.ruleCode === 'supplier_bank_account_changed');
    assert.ok(finding);
    assert.equal(finding.severity, 'high');
  });

  it('does not flag a known IBAN', () => {
    const earlier = invoice({ id: 'old', bankAccount: IBAN_A, createdAt: '2026-10-01T10:00:00Z' });
    const result = evaluateInvoiceRisk(invoice({ bankAccount: IBAN_A.toLowerCase().replace(/(.{4})/g, '$1 ') }), [earlier]);
    assert.equal(ruleCodes(result).includes('supplier_bank_account_changed'), false);
  });

  it('does not flag when there is no history', () => {
    const result = evaluateInvoiceRisk(invoice({ bankAccount: IBAN_B }), []);
    assert.equal(ruleCodes(result).includes('supplier_bank_account_changed'), false);
  });
});

describe('NIP findings', () => {
  it('marks a 7-digit NIP as critical and skips history rules', () => {
    const earlier = invoice({ id: 'old', sellerNip: '5213256', createdAt: '2026-10-01T10:00:00Z' });
    const result = evaluateInvoiceRisk(invoice({ sellerNip: '5213256' }), [earlier]);
    const invalid = result.findings.find((f) => f.ruleCode === 'invalid_supplier_nip');
    assert.ok(invalid);
    assert.equal(invalid.severity, 'critical');
    assert.equal(result.nipValid, false);
    assert.equal(ruleCodes(result).includes('duplicate_invoice'), false);
  });

  it('flags a missing NIP', () => {
    const result = evaluateInvoiceRisk(invoice({ sellerNip: null }), []);
    assert.equal(ruleCodes(result).includes('missing_supplier_nip'), true);
    assert.equal(ruleCodes(result).includes('invalid_supplier_nip'), false);
  });
});

describe('supplier master data rule', () => {
  it('flags a supplier name that differs from history for the same NIP', () => {
    const earlier = invoice({ id: 'old', sellerName: 'Old Name Sp. z o.o.', bankAccount: IBAN_A, createdAt: '2026-10-01T10:00:00Z' });
    const result = evaluateInvoiceRisk(invoice({ sellerName: 'New Name Sp. z o.o.', bankAccount: IBAN_A }), [earlier]);
    const finding = result.findings.find((f) => f.ruleCode === 'supplier_master_data_changed');
    assert.ok(finding);
    assert.equal(finding.severity, 'medium');
  });

  it('ignores case and extra whitespace in the supplier name', () => {
    const earlier = invoice({ id: 'old', sellerName: 'KrisAczi', bankAccount: IBAN_A, createdAt: '2026-10-01T10:00:00Z' });
    const result = evaluateInvoiceRisk(invoice({ sellerName: '  krisaczi ', bankAccount: IBAN_A }), [earlier]);
    assert.equal(ruleCodes(result).includes('supplier_master_data_changed'), false);
  });
});

describe('clean invoice', () => {
  it('produces no findings', () => {
    const result = evaluateInvoiceRisk(invoice(), []);
    assert.deepEqual(result.findings, []);
  });
});
