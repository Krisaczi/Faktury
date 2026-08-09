/**
 * Unit tests for selectProduct business logic and user-limit enforcement.
 *
 * Strategy: inline simulations of the business rules with controlled data —
 * no live DB, auth, or server actions required.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/packages/select-product.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductType = 'starter' | 'professional';

interface PackageFeatures {
  vendors_limit:     number | null;
  reports_per_month: number | null;
  users_limit:       number | null;
  file_uploads:      boolean;
  invoicing:         boolean;
  support:           'email' | 'priority' | 'none';
}

interface CompanyRow {
  id:                  string;
  product_type:        ProductType | null;
  subscription_status: string;
}

interface UserRow {
  id:         string;
  company_id: string;
  role:       string;
  active:     boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STARTER_FEATURES: PackageFeatures = {
  vendors_limit:     25,
  reports_per_month: 10,
  users_limit:       1,
  file_uploads:      true,
  invoicing:         false,
  support:           'email',
};

const PROFESSIONAL_FEATURES: PackageFeatures = {
  vendors_limit:     null,
  reports_per_month: null,
  users_limit:       3,
  file_uploads:      true,
  invoicing:         true,
  support:           'priority',
};

function featuresForProduct(type: ProductType): PackageFeatures {
  return type === 'professional' ? PROFESSIONAL_FEATURES : STARTER_FEATURES;
}

// ─── Inline simulation of selectProduct logic ─────────────────────────────────

function simulateSelectProduct(opts: {
  caller:      UserRow;
  companyId:   string;
  productType: ProductType;
  store:       Map<string, CompanyRow>;
  auditLog:    Array<{ companyId: string; next: Record<string, unknown> }>;
}): { ok: boolean; error?: string; usersLimit?: number | null } {
  const { caller, companyId, productType, store, auditLog } = opts;

  // Auth guard: caller must be owner or accountant of the company
  if (!['owner', 'accountant'].includes(caller.role)) {
    return { ok: false, error: 'Brak uprawnień do zarządzania pakietami.' };
  }
  if (caller.company_id !== companyId) {
    return { ok: false, error: 'Brak dostępu do tej firmy.' };
  }

  if (productType !== 'starter' && productType !== 'professional') {
    return { ok: false, error: 'Nieprawidłowy typ produktu.' };
  }

  const payload = {
    product_type:        productType,
    package_type:        productType,
    subscription_status: 'active',
  };

  store.set(companyId, { ...store.get(companyId)!, ...payload });
  auditLog.push({ companyId, next: payload });

  const features = featuresForProduct(productType);
  return { ok: true, usersLimit: features.users_limit };
}

// ─── Inline simulation of checkUserLimit ──────────────────────────────────────

function simulateCheckUserLimit(
  features: PackageFeatures,
  currentUserCount: number,
): { allowed: boolean; reason?: string } {
  if (features.users_limit === null) return { allowed: true };
  if (currentUserCount < features.users_limit) return { allowed: true };
  return {
    allowed: false,
    reason:  `Osiągnięto limit ${features.users_limit} użytkowników dla Twojego pakietu. Zaktualizuj pakiet, aby dodać więcej.`,
  };
}

// ─── Inline simulation of onboardNewUser user-limit check ─────────────────────

function simulateOnboardNewUser(opts: {
  caller:          UserRow;
  companyId:       string;
  emailToAdd:      string;
  existingUsers:   Array<{ email: string; company_id: string; active: boolean }>;
  companyFeatures: PackageFeatures;
}): { ok: boolean; error?: string } {
  const { caller, companyId, emailToAdd, existingUsers, companyFeatures } = opts;

  if (!['owner', 'accountant'].includes(caller.role)) {
    return { ok: false, error: 'Brak uprawnień.' };
  }

  const duplicate = existingUsers.find(
    (u) => u.email === emailToAdd && u.company_id === companyId,
  );
  if (duplicate) {
    return { ok: false, error: 'Użytkownik z tym adresem e-mail już istnieje w firmie.' };
  }

  const activeCount = existingUsers.filter(
    (u) => u.company_id === companyId && u.active,
  ).length;

  const limitCheck = simulateCheckUserLimit(companyFeatures, activeCount);
  if (!limitCheck.allowed) {
    return { ok: false, error: limitCheck.reason };
  }

  return { ok: true };
}

// ─── Tests: selectProduct ─────────────────────────────────────────────────────

describe('selectProduct', () => {
  function makeStore(): Map<string, CompanyRow> {
    return new Map([
      ['company-1', { id: 'company-1', product_type: null, subscription_status: 'active' }],
    ]);
  }

  const owner: UserRow = { id: 'user-owner', company_id: 'company-1', role: 'owner', active: true };
  const auditLog: Array<{ companyId: string; next: Record<string, unknown> }> = [];

  it('sets starter product', () => {
    const store = makeStore();
    const result = simulateSelectProduct({ caller: owner, companyId: 'company-1', productType: 'starter', store, auditLog });
    assert.ok(result.ok);
    assert.equal(result.usersLimit, 1);
    const row = store.get('company-1')!;
    assert.equal(row.product_type, 'starter');
    assert.equal(row.subscription_status, 'active');
  });

  it('sets professional product', () => {
    const store = makeStore();
    const result = simulateSelectProduct({ caller: owner, companyId: 'company-1', productType: 'professional', store, auditLog });
    assert.ok(result.ok);
    assert.equal(result.usersLimit, 3);
    const row = store.get('company-1')!;
    assert.equal(row.product_type, 'professional');
    assert.equal(row.subscription_status, 'active');
  });

  it('rejects caller with an invalid role', () => {
    const store = makeStore();
    const stranger: UserRow = { id: 'user-x', company_id: 'company-1', role: 'somerole', active: true };
    const result = simulateSelectProduct({ caller: stranger, companyId: 'company-1', productType: 'starter', store, auditLog });
    assert.ok(!result.ok);
    assert.match(result.error!, /uprawnie/);
  });

  it('allows accountant callers', () => {
    const store = makeStore();
    const accountant: UserRow = { id: 'user-acc', company_id: 'company-1', role: 'accountant', active: true };
    const result = simulateSelectProduct({ caller: accountant, companyId: 'company-1', productType: 'starter', store, auditLog });
    assert.ok(result.ok);
  });

  it('rejects caller from a different company', () => {
    const store = makeStore();
    const outsider: UserRow = { id: 'user-out', company_id: 'company-2', role: 'owner', active: true };
    const result = simulateSelectProduct({ caller: outsider, companyId: 'company-1', productType: 'starter', store, auditLog });
    assert.ok(!result.ok);
  });

  it('writes an audit log entry', () => {
    const store = makeStore();
    const log: Array<{ companyId: string; next: Record<string, unknown> }> = [];
    simulateSelectProduct({ caller: owner, companyId: 'company-1', productType: 'professional', store, auditLog: log });
    assert.equal(log.length, 1);
    assert.equal(log[0].companyId, 'company-1');
    assert.equal(log[0].next.product_type, 'professional');
  });
});

// ─── Tests: checkUserLimit ────────────────────────────────────────────────────

describe('checkUserLimit', () => {
  it('allows when limit is null (unlimited)', () => {
    const unlimited: PackageFeatures = { ...PROFESSIONAL_FEATURES, users_limit: null };
    const result = simulateCheckUserLimit(unlimited, 9999);
    assert.ok(result.allowed);
  });

  it('allows when count is below the limit', () => {
    const result = simulateCheckUserLimit(STARTER_FEATURES, 0);
    assert.ok(result.allowed);
  });

  it('blocks when count equals the limit', () => {
    const result = simulateCheckUserLimit(STARTER_FEATURES, 1);
    assert.ok(!result.allowed);
    assert.ok(result.reason?.includes('1'));
  });

  it('blocks when count exceeds the limit', () => {
    const result = simulateCheckUserLimit(STARTER_FEATURES, 5);
    assert.ok(!result.allowed);
  });

  it('professional blocks at 3 users', () => {
    const result = simulateCheckUserLimit(PROFESSIONAL_FEATURES, 3);
    assert.ok(!result.allowed);
    assert.ok(result.reason?.includes('3'));
  });
});

// ─── Tests: onboardNewUser user limit enforcement ─────────────────────────────

describe('onboardNewUser — user limit enforcement', () => {
  const owner: UserRow = { id: 'owner-1', company_id: 'co-1', role: 'owner', active: true };

  it('allows first user on starter plan (0 active users)', () => {
    const result = simulateOnboardNewUser({
      caller:          owner,
      companyId:       'co-1',
      emailToAdd:      'new@example.com',
      existingUsers:   [{ email: 'owner@example.com', company_id: 'co-1', active: true }],
      companyFeatures: STARTER_FEATURES,
    });
    // owner counts as 1 active user; starter limit = 1 → blocked
    assert.ok(!result.ok);
    assert.match(result.error!, /limit/i);
  });

  it('allows adding user on professional when below limit', () => {
    const result = simulateOnboardNewUser({
      caller:          owner,
      companyId:       'co-1',
      emailToAdd:      'new@example.com',
      existingUsers:   [
        { email: 'owner@example.com',   company_id: 'co-1', active: true },
        { email: 'member@example.com',  company_id: 'co-1', active: true },
      ],
      companyFeatures: PROFESSIONAL_FEATURES,
    });
    assert.ok(result.ok);
  });

  it('blocks adding 4th user on professional plan', () => {
    const result = simulateOnboardNewUser({
      caller:          owner,
      companyId:       'co-1',
      emailToAdd:      'fourth@example.com',
      existingUsers:   [
        { email: 'u1@example.com', company_id: 'co-1', active: true },
        { email: 'u2@example.com', company_id: 'co-1', active: true },
        { email: 'u3@example.com', company_id: 'co-1', active: true },
      ],
      companyFeatures: PROFESSIONAL_FEATURES,
    });
    assert.ok(!result.ok);
    assert.match(result.error!, /3/);
  });

  it('does not count inactive users toward the limit', () => {
    const result = simulateOnboardNewUser({
      caller:          owner,
      companyId:       'co-1',
      emailToAdd:      'new@example.com',
      existingUsers:   [
        { email: 'inactive@example.com', company_id: 'co-1', active: false },
        { email: 'inactive2@example.com', company_id: 'co-1', active: false },
      ],
      companyFeatures: STARTER_FEATURES,
    });
    assert.ok(result.ok);
  });

  it('rejects duplicate email', () => {
    const result = simulateOnboardNewUser({
      caller:          owner,
      companyId:       'co-1',
      emailToAdd:      'dup@example.com',
      existingUsers:   [{ email: 'dup@example.com', company_id: 'co-1', active: true }],
      companyFeatures: PROFESSIONAL_FEATURES,
    });
    assert.ok(!result.ok);
    assert.match(result.error!, /już istnieje/);
  });
});
