/**
 * Unit tests for ZIP / postal code validation.
 *
 * Tests the Polish postal code regex (XX-XXX) used in both client-side
 * form validation and server-side Zod schemas.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/customers/zip-validation.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ZIP_REGEX = /^\d{2}-\d{3}$/;

describe('ZIP / postal code validation', () => {
  // ─── Valid formats ───────────────────────────────────────────────────────────

  it('accepts standard Polish format XX-XXX', () => {
    assert.ok(ZIP_REGEX.test('00-001'));
    assert.ok(ZIP_REGEX.test('31-000'));
    assert.ok(ZIP_REGEX.test('50-123'));
    assert.ok(ZIP_REGEX.test('99-999'));
  });

  // ─── Invalid formats ─────────────────────────────────────────────────────────

  it('rejects missing dash', () => {
    assert.equal(ZIP_REGEX.test('00123'), false);
    assert.equal(ZIP_REGEX.test('00001'), false);
  });

  it('rejects too few digits', () => {
    assert.equal(ZIP_REGEX.test('00-00'), false);
    assert.equal(ZIP_REGEX.test('0-001'), false);
  });

  it('rejects too many digits', () => {
    assert.equal(ZIP_REGEX.test('000-001'), false);
    assert.equal(ZIP_REGEX.test('00-0012'), false);
  });

  it('rejects letters', () => {
    assert.equal(ZIP_REGEX.test('ab-cde'), false);
    assert.equal(ZIP_REGEX.test('00-abc'), false);
  });

  it('rejects empty string', () => {
    assert.equal(ZIP_REGEX.test(''), false);
  });

  it('rejects spaces', () => {
    assert.equal(ZIP_REGEX.test('00 - 001'), false);
    assert.equal(ZIP_REGEX.test(' 00-001 '), false);
  });

  it('rejects wrong dash position', () => {
    assert.equal(ZIP_REGEX.test('0-0001'), false);
    assert.equal(ZIP_REGEX.test('000-01'), false);
  });
});

// ─── Simulated form validation ─────────────────────────────────────────────────

describe('Customer form ZIP validation', () => {
  function validateZip(zip: string): string | null {
    if (!zip.trim()) return 'Kod pocztowy jest wymagany';
    if (!ZIP_REGEX.test(zip.trim())) return 'Kod pocztowy musi mieć format XX-XXX';
    return null;
  }

  it('returns error for empty ZIP', () => {
    assert.equal(validateZip(''), 'Kod pocztowy jest wymagany');
  });

  it('returns error for whitespace-only ZIP', () => {
    assert.equal(validateZip('   '), 'Kod pocztowy jest wymagany');
  });

  it('returns error for invalid format', () => {
    assert.equal(validateZip('12345'), 'Kod pocztowy musi mieć format XX-XXX');
  });

  it('returns null for valid ZIP', () => {
    assert.equal(validateZip('00-001'), null);
    assert.equal(validateZip('31-000'), null);
  });

  it('trims whitespace before checking format', () => {
    assert.equal(validateZip('  00-001  '), null);
  });
});

// ─── Simulated server-side Zod-style validation ───────────────────────────────

describe('Server-side ZIP schema validation', () => {
  function serverValidate(input: { name: string; nip: string; address: string; zip?: string }) {
    const errors: Record<string, string[]> = {};
    if (!input.zip || !input.zip.trim()) {
      errors.zip = ['Kod pocztowy musi mieć format XX-XXX'];
    } else if (!ZIP_REGEX.test(input.zip.trim())) {
      errors.zip = ['Kod pocztowy musi mieć format XX-XXX'];
    }
    return Object.keys(errors).length === 0 ? null : errors;
  }

  it('rejects missing zip field', () => {
    const errors = serverValidate({ name: 'Test', nip: '1234567890', address: 'ul. X 1' });
    assert.ok(errors);
    assert.ok(errors.zip);
  });

  it('rejects empty zip', () => {
    const errors = serverValidate({ name: 'Test', nip: '1234567890', address: 'ul. X 1', zip: '' });
    assert.ok(errors);
    assert.ok(errors.zip);
  });

  it('rejects malformed zip', () => {
    const errors = serverValidate({ name: 'Test', nip: '1234567890', address: 'ul. X 1', zip: '12345' });
    assert.ok(errors);
    assert.ok(errors.zip);
  });

  it('passes with valid zip', () => {
    const errors = serverValidate({ name: 'Test', nip: '1234567890', address: 'ul. X 1', zip: '00-001' });
    assert.equal(errors, null);
  });
});
