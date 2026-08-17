/**
 * Unit tests for customer management access gating (canManageCustomers).
 *
 * Rules:
 *   - Owner: always allowed regardless of plan
 *   - Accountant on Professional: allowed
 *   - Accountant on Starter: blocked
 *   - Unknown/null role: blocked
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/customers/access-gating.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { canManageCustomers } from '../../permissions';

describe('canManageCustomers', () => {
  // ─── Owner ─────────────────────────────────────────────────────────────────

  it('allows owner regardless of plan', () => {
    assert.equal(canManageCustomers('owner', 'starter'), true);
    assert.equal(canManageCustomers('owner', 'professional'), true);
  });

  it('allows owner when packageType is null', () => {
    assert.equal(canManageCustomers('owner', null), true);
  });

  // ─── Accountant ────────────────────────────────────────────────────────────

  it('allows accountant on professional plan', () => {
    assert.equal(canManageCustomers('accountant', 'professional'), true);
  });

  it('blocks accountant on starter plan', () => {
    assert.equal(canManageCustomers('accountant', 'starter'), false);
  });

  it('blocks accountant when packageType is null', () => {
    assert.equal(canManageCustomers('accountant', null), false);
  });

  // ─── Unknown / invalid roles ────────────────────────────────────────────────

  it('blocks unknown role even on professional', () => {
    assert.equal(canManageCustomers('admin', 'professional'), false);
  });

  it('blocks empty-string role', () => {
    assert.equal(canManageCustomers('', 'professional'), false);
  });

  it('blocks null role', () => {
    assert.equal(canManageCustomers(null, 'professional'), false);
  });

  it('blocks undefined role', () => {
    assert.equal(canManageCustomers(undefined, 'professional'), false);
  });

  // ─── Edge cases ─────────────────────────────────────────────────────────────

  it('blocks accountant on unknown package type', () => {
    assert.equal(canManageCustomers('accountant', 'enterprise'), false);
  });

  it('is case-sensitive on packageType', () => {
    assert.equal(canManageCustomers('accountant', 'Professional'), false);
  });
});
