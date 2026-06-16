/**
 * Unit tests for plan enforcement helpers: invoicing access and user-slot limits.
 *
 * Strategy: inline simulations of the business rules — no live DB or server.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/packages/enforcement.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PackageFeatures {
  vendors_limit:     number | null;
  reports_per_month: number | null;
  users_limit:       number | null;
  file_uploads:      boolean;
  invoicing:         boolean;
  support:           'email' | 'priority' | 'none';
}

interface EnforcementResult {
  allowed:    boolean;
  reason?:    string;
  upgradeKey?: string;
}

// ─── Simulated helpers ────────────────────────────────────────────────────────

function checkInvoicingAccess(features: PackageFeatures): EnforcementResult {
  if (features.invoicing) return { allowed: true };
  return {
    allowed:    false,
    reason:     'Fakturowanie nie jest dostępne w Twoim pakiecie. Zaktualizuj do Pro, aby wystawiać faktury.',
    upgradeKey: 'invoicing',
  };
}

function checkUserLimit(
  features: PackageFeatures,
  currentUserCount: number,
): EnforcementResult {
  if (features.users_limit === null) return { allowed: true };
  if (currentUserCount < features.users_limit) return { allowed: true };
  const upgrade = features.users_limit === 1
    ? 'Plan Starter pozwala na 1 użytkownika. Przejdź na Professional, aby dodać więcej.'
    : `Plan Professional pozwala na ${features.users_limit} użytkowników. Skontaktuj się z właścicielem, aby rozszerzyć plan.`;
  return {
    allowed:    false,
    reason:     upgrade,
    upgradeKey: 'users_limit',
  };
}

function simulateRequireInvoicingEnabled(features: PackageFeatures): void {
  if (!features.invoicing) {
    const err = Object.assign(
      new Error('Fakturowanie jest dostępne tylko w planie Professional. Zaktualizuj plan, aby wystawiać faktury.'),
      { code: 'INVOICING_NOT_AVAILABLE', status: 403 },
    );
    throw err;
  }
}

function simulateRequireUserSlot(
  features: PackageFeatures,
  activeUserCount: number,
): void {
  const check = checkUserLimit(features, activeUserCount);
  if (!check.allowed) {
    const err = Object.assign(
      new Error(check.reason!),
      { code: 'USER_LIMIT_REACHED', status: 403 },
    );
    throw err;
  }
}

// ─── Feature presets ──────────────────────────────────────────────────────────

const STARTER: PackageFeatures = {
  vendors_limit:     25,
  reports_per_month: 10,
  users_limit:       1,
  file_uploads:      true,
  invoicing:         false,
  support:           'email',
};

const PROFESSIONAL: PackageFeatures = {
  vendors_limit:     null,
  reports_per_month: null,
  users_limit:       3,
  file_uploads:      true,
  invoicing:         true,
  support:           'priority',
};

const UNLIMITED: PackageFeatures = { ...PROFESSIONAL, users_limit: null };

// ─── checkInvoicingAccess ─────────────────────────────────────────────────────

describe('checkInvoicingAccess', () => {
  it('allows invoicing on professional plan', () => {
    const result = checkInvoicingAccess(PROFESSIONAL);
    assert.equal(result.allowed, true);
  });

  it('blocks invoicing on starter plan', () => {
    const result = checkInvoicingAccess(STARTER);
    assert.equal(result.allowed, false);
    assert.equal(result.upgradeKey, 'invoicing');
    assert.ok(result.reason?.includes('Pro'));
  });

  it('blocks invoicing on individual plan without invoicing flag', () => {
    const individual: PackageFeatures = { ...STARTER, invoicing: false };
    const result = checkInvoicingAccess(individual);
    assert.equal(result.allowed, false);
  });

  it('allows invoicing when invoicing flag is true regardless of plan name', () => {
    const custom: PackageFeatures = { ...STARTER, invoicing: true };
    const result = checkInvoicingAccess(custom);
    assert.equal(result.allowed, true);
  });
});

// ─── checkUserLimit ───────────────────────────────────────────────────────────

describe('checkUserLimit', () => {
  it('allows when limit is null (unlimited plan)', () => {
    const result = checkUserLimit(UNLIMITED, 100);
    assert.equal(result.allowed, true);
  });

  it('allows when count is below starter limit', () => {
    const result = checkUserLimit(STARTER, 0);
    assert.equal(result.allowed, true);
  });

  it('blocks when count equals starter limit (1)', () => {
    const result = checkUserLimit(STARTER, 1);
    assert.equal(result.allowed, false);
    assert.equal(result.upgradeKey, 'users_limit');
    assert.ok(result.reason?.includes('Starter'));
    assert.ok(result.reason?.includes('Professional'));
  });

  it('blocks when count exceeds starter limit', () => {
    const result = checkUserLimit(STARTER, 5);
    assert.equal(result.allowed, false);
  });

  it('allows when count is below professional limit (2 of 3)', () => {
    const result = checkUserLimit(PROFESSIONAL, 2);
    assert.equal(result.allowed, true);
  });

  it('blocks when count equals professional limit (3 of 3)', () => {
    const result = checkUserLimit(PROFESSIONAL, 3);
    assert.equal(result.allowed, false);
    assert.equal(result.upgradeKey, 'users_limit');
    assert.ok(result.reason?.includes('Professional'));
    assert.ok(result.reason?.includes('3'));
  });

  it('blocks when count exceeds professional limit', () => {
    const result = checkUserLimit(PROFESSIONAL, 10);
    assert.equal(result.allowed, false);
  });

  it('starter error message mentions upgrade path', () => {
    const result = checkUserLimit(STARTER, 1);
    assert.ok(result.reason?.includes('Przejdź na Professional'));
  });

  it('professional error message mentions contacting owner', () => {
    const result = checkUserLimit(PROFESSIONAL, 3);
    assert.ok(result.reason?.includes('Skontaktuj się'));
  });
});

// ─── requireInvoicingEnabled (simulated) ─────────────────────────────────────

describe('requireInvoicingEnabled', () => {
  it('does not throw for professional plan', () => {
    assert.doesNotThrow(() => simulateRequireInvoicingEnabled(PROFESSIONAL));
  });

  it('throws for starter plan', () => {
    assert.throws(
      () => simulateRequireInvoicingEnabled(STARTER),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error & { code: string }).code, 'INVOICING_NOT_AVAILABLE');
        assert.equal((err as Error & { status: number }).status, 403);
        assert.ok((err as Error).message.includes('Professional'));
        return true;
      },
    );
  });

  it('error message is actionable', () => {
    let caught: Error | null = null;
    try { simulateRequireInvoicingEnabled(STARTER); } catch (e) { caught = e as Error; }
    assert.ok(caught);
    assert.ok(caught.message.includes('Zaktualizuj plan'));
  });

  it('throws with code INVOICING_NOT_AVAILABLE', () => {
    try {
      simulateRequireInvoicingEnabled(STARTER);
      assert.fail('should have thrown');
    } catch (e) {
      assert.equal((e as Error & { code: string }).code, 'INVOICING_NOT_AVAILABLE');
    }
  });

  it('throws with HTTP status 403', () => {
    try {
      simulateRequireInvoicingEnabled(STARTER);
      assert.fail('should have thrown');
    } catch (e) {
      assert.equal((e as Error & { status: number }).status, 403);
    }
  });
});

// ─── requireUserSlot (simulated) ─────────────────────────────────────────────

describe('requireUserSlot', () => {
  it('does not throw when slot is available on starter (0 active users)', () => {
    assert.doesNotThrow(() => simulateRequireUserSlot(STARTER, 0));
  });

  it('throws when starter has 1 active user (limit reached)', () => {
    assert.throws(
      () => simulateRequireUserSlot(STARTER, 1),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error & { code: string }).code, 'USER_LIMIT_REACHED');
        assert.equal((err as Error & { status: number }).status, 403);
        return true;
      },
    );
  });

  it('does not throw when professional has 2 active users (limit is 3)', () => {
    assert.doesNotThrow(() => simulateRequireUserSlot(PROFESSIONAL, 2));
  });

  it('throws when professional has 3 active users (limit reached)', () => {
    assert.throws(
      () => simulateRequireUserSlot(PROFESSIONAL, 3),
      (err: unknown) => {
        assert.equal((err as Error & { code: string }).code, 'USER_LIMIT_REACHED');
        return true;
      },
    );
  });

  it('does not throw when limit is null regardless of user count', () => {
    assert.doesNotThrow(() => simulateRequireUserSlot(UNLIMITED, 1000));
  });

  it('error carries actionable message for starter plan', () => {
    try {
      simulateRequireUserSlot(STARTER, 1);
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok((e as Error).message.includes('Starter'));
      assert.ok((e as Error).message.includes('Professional'));
    }
  });

  it('error carries actionable message for professional plan', () => {
    try {
      simulateRequireUserSlot(PROFESSIONAL, 3);
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok((e as Error).message.includes('Professional'));
    }
  });

  it('throws with HTTP status 403 for starter slot exhausted', () => {
    try {
      simulateRequireUserSlot(STARTER, 1);
      assert.fail('should have thrown');
    } catch (e) {
      assert.equal((e as Error & { status: number }).status, 403);
    }
  });
});

// ─── Combined enforcement scenarios ──────────────────────────────────────────

describe('combined plan enforcement scenarios', () => {
  it('starter plan blocks both invoicing and adding a second user', () => {
    const invoicingResult = checkInvoicingAccess(STARTER);
    const userResult      = checkUserLimit(STARTER, 1);
    assert.equal(invoicingResult.allowed, false);
    assert.equal(userResult.allowed, false);
  });

  it('professional plan allows invoicing and adding up to 3 users', () => {
    const invoicingResult = checkInvoicingAccess(PROFESSIONAL);
    const userResult      = checkUserLimit(PROFESSIONAL, 2);
    assert.equal(invoicingResult.allowed, true);
    assert.equal(userResult.allowed, true);
  });

  it('professional plan blocks 4th user but keeps invoicing allowed', () => {
    const invoicingResult = checkInvoicingAccess(PROFESSIONAL);
    const userResult      = checkUserLimit(PROFESSIONAL, 3);
    assert.equal(invoicingResult.allowed, true);
    assert.equal(userResult.allowed, false);
  });

  it('both checks pass for unlimited individual plan with invoicing', () => {
    const custom: PackageFeatures = { ...UNLIMITED, invoicing: true };
    assert.equal(checkInvoicingAccess(custom).allowed, true);
    assert.equal(checkUserLimit(custom, 999).allowed, true);
  });
});
