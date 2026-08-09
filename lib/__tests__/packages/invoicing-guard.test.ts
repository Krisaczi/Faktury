/**
 * Unit tests for the centralized package-based invoicing guard.
 *
 * Covers requireProForInvoicing from lib/packages/invoicing-guard.ts:
 *   - Owner role → allowed regardless of package
 *   - Accountant on professional → allowed
 *   - Accountant on starter → NOT allowed (403)
 *   - Unknown role → NOT allowed
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/packages/invoicing-guard.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { requireProForInvoicing } from '../../packages/invoicing-guard';

// ─── requireProForInvoicing ───────────────────────────────────────────────────

describe('requireProForInvoicing', () => {
  it('allows owner regardless of package', () => {
    const result = requireProForInvoicing({ role: 'owner', companyId: 'co-1', packageType: 'starter' });
    assert.equal(result.allowed, true);
  });

  it('allows owner even when packageType is null', () => {
    const result = requireProForInvoicing({ role: 'owner', companyId: 'co-1', packageType: null });
    assert.equal(result.allowed, true);
  });

  it('allows accountant on professional package', () => {
    const result = requireProForInvoicing({ role: 'accountant', companyId: 'co-1', packageType: 'professional' });
    assert.equal(result.allowed, true);
  });

  it('blocks accountant on starter package with 403', () => {
    const result = requireProForInvoicing({ role: 'accountant', companyId: 'co-1', packageType: 'starter' });
    assert.equal(result.allowed, false);
    assert.equal(result.status, 403);
    assert.equal(result.code, 'INVOICING_NOT_AVAILABLE');
    assert.ok(result.reason?.includes('Professional'));
  });

  it('blocks accountant when packageType is null', () => {
    const result = requireProForInvoicing({ role: 'accountant', companyId: 'co-1', packageType: null });
    assert.equal(result.allowed, false);
    assert.equal(result.status, 403);
    assert.equal(result.code, 'INVOICING_NOT_AVAILABLE');
  });

  it('blocks unknown role with 403', () => {
    const result = requireProForInvoicing({ role: 'somerole', companyId: 'co-1', packageType: 'professional' });
    assert.equal(result.allowed, false);
    assert.equal(result.status, 403);
    assert.equal(result.code, 'UNKNOWN_ROLE');
  });

  it('blocks unknown role even on professional package', () => {
    const result = requireProForInvoicing({ role: 'admin', companyId: 'co-1', packageType: 'professional' });
    assert.equal(result.allowed, false);
    assert.equal(result.code, 'UNKNOWN_ROLE');
  });

  it('blocks empty-string role', () => {
    const result = requireProForInvoicing({ role: '', companyId: 'co-1', packageType: 'professional' });
    assert.equal(result.allowed, false);
    assert.equal(result.code, 'UNKNOWN_ROLE');
  });

  it('starter-blocked error message is actionable', () => {
    const result = requireProForInvoicing({ role: 'accountant', companyId: 'co-1', packageType: 'starter' });
    assert.ok(result.reason?.includes('Starter'));
    assert.ok(result.reason?.includes('Professional'));
  });

  it('does not include a reason when allowed', () => {
    const result = requireProForInvoicing({ role: 'accountant', companyId: 'co-1', packageType: 'professional' });
    assert.equal(result.reason, undefined);
    assert.equal(result.code, undefined);
    assert.equal(result.status, undefined);
  });
});
