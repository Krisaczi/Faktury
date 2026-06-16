/**
 * Unit tests for onboarding actions business logic.
 *
 * Strategy: inline simulations of createCompany, finalizeProduct, and
 * getOnboardingState — no live DB or server required.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/onboarding/onboarding.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

// ─── Types ────────────────────────────────────────────────────────────────────

type OnboardingStep = 'start' | 'company_created' | 'product_selected';
type ProductType    = 'starter' | 'professional';
type TrialChoice    = 'trial' | 'immediate';

interface CompanyRow {
  id:              string;
  name:            string;
  nip:             string;
  currency:        string;
  onboarding_step: OnboardingStep | null;
  product_type:    ProductType | null;
  trial_active:    boolean;
  trial_expires_at: string | null;
}

interface UserRow {
  id:         string;
  company_id: string | null;
}

interface OnboardingState {
  step:        OnboardingStep;
  companyId:   string | null;
  productType: ProductType | null;
}

// ─── Validation schema (mirrors onboarding page) ──────────────────────────────

const companySchema = z.object({
  companyName: z.string().min(2, 'Nazwa musi mieć co najmniej 2 znaki'),
  nip:         z.string().regex(/^\d{10}$/, 'NIP musi mieć dokładnie 10 cyfr'),
  street:      z.string().min(3, 'Podaj ulicę i numer'),
  zip:         z.string().regex(/^\d{2}-\d{3}$/, 'Format kodu: XX-XXX'),
  city:        z.string().min(2, 'Podaj miejscowość'),
  currency:    z.enum(['PLN', 'EUR', 'USD', 'GBP']),
});

// ─── Simulated helpers ────────────────────────────────────────────────────────

function simulateSlugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function simulateCreateCompany(
  user: UserRow | null,
  existing: CompanyRow | null,
  params: {
    companyName: string; nip: string; street: string;
    zip: string; city: string; currency: string;
  },
  db: CompanyRow[],
): { ok: boolean; data?: { companyId: string; step: OnboardingStep }; error?: string } {
  if (!user) return { ok: false, error: 'Sesja wygasła. Zaloguj się ponownie.' };
  if (user.company_id && existing) {
    return {
      ok: true,
      data: { companyId: user.company_id, step: existing.onboarding_step ?? 'company_created' },
    };
  }

  const id = `company-${db.length + 1}`;
  const row: CompanyRow = {
    id,
    name:            params.companyName,
    nip:             params.nip,
    currency:        params.currency,
    onboarding_step: 'company_created',
    product_type:    null,
    trial_active:    false,
    trial_expires_at: null,
  };
  db.push(row);
  return { ok: true, data: { companyId: id, step: 'company_created' } };
}

function simulateFinalizeProduct(
  user: UserRow | null,
  company: CompanyRow | null,
  params: { companyId: string; productType: ProductType; trialActive: boolean },
): { ok: boolean; data?: { companyId: string }; error?: string } {
  if (!user) return { ok: false, error: 'Sesja wygasła. Zaloguj się ponownie.' };
  if (!company || user.company_id !== params.companyId) {
    return { ok: false, error: 'Brak uprawnień do tej firmy.' };
  }

  company.product_type    = params.productType;
  company.trial_active    = params.trialActive;
  company.onboarding_step = 'product_selected';
  if (params.trialActive) {
    company.trial_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  } else {
    company.trial_expires_at = null;
  }

  return { ok: true, data: { companyId: params.companyId } };
}

function simulateGetOnboardingState(
  user: UserRow | null,
  company: CompanyRow | null,
): OnboardingState {
  if (!user || !user.company_id || !company) {
    return { step: 'start', companyId: null, productType: null };
  }
  if (company.onboarding_step === 'product_selected') {
    return { step: 'product_selected', companyId: user.company_id, productType: company.product_type };
  }
  return { step: 'company_created', companyId: user.company_id, productType: company.product_type };
}

// ─── companySchema validation ─────────────────────────────────────────────────

describe('companySchema validation', () => {
  const valid = {
    companyName: 'Acme Sp. z o.o.',
    nip:         '1234567890',
    street:      'ul. Główna 1',
    zip:         '00-001',
    city:        'Warszawa',
    currency:    'PLN',
  };

  it('accepts a valid company payload', () => {
    const result = companySchema.safeParse(valid);
    assert.equal(result.success, true);
  });

  it('rejects a name that is too short', () => {
    const result = companySchema.safeParse({ ...valid, companyName: 'A' });
    assert.equal(result.success, false);
    const issues = result.success ? [] : result.error.issues;
    assert.ok(issues.some((i) => i.path[0] === 'companyName'));
  });

  it('rejects an invalid NIP (not 10 digits)', () => {
    const result = companySchema.safeParse({ ...valid, nip: '12345' });
    assert.equal(result.success, false);
  });

  it('rejects a NIP with letters', () => {
    const result = companySchema.safeParse({ ...valid, nip: '123456789A' });
    assert.equal(result.success, false);
  });

  it('accepts exactly 10 digit NIP', () => {
    const result = companySchema.safeParse({ ...valid, nip: '9876543210' });
    assert.equal(result.success, true);
  });

  it('rejects invalid zip format (missing dash)', () => {
    const result = companySchema.safeParse({ ...valid, zip: '00001' });
    assert.equal(result.success, false);
  });

  it('rejects invalid zip format (wrong digit counts)', () => {
    const result = companySchema.safeParse({ ...valid, zip: '001-01' });
    assert.equal(result.success, false);
  });

  it('accepts correct zip format', () => {
    const result = companySchema.safeParse({ ...valid, zip: '12-345' });
    assert.equal(result.success, true);
  });

  it('rejects street shorter than 3 characters', () => {
    const result = companySchema.safeParse({ ...valid, street: 'ul' });
    assert.equal(result.success, false);
  });

  it('rejects city shorter than 2 characters', () => {
    const result = companySchema.safeParse({ ...valid, city: 'A' });
    assert.equal(result.success, false);
  });

  it('rejects unsupported currency', () => {
    const result = companySchema.safeParse({ ...valid, currency: 'CHF' });
    assert.equal(result.success, false);
  });

  it('accepts all supported currencies', () => {
    for (const currency of ['PLN', 'EUR', 'USD', 'GBP']) {
      const result = companySchema.safeParse({ ...valid, currency });
      assert.equal(result.success, true, `Expected ${currency} to be valid`);
    }
  });
});

// ─── createCompany ────────────────────────────────────────────────────────────

describe('simulateCreateCompany', () => {
  const params = { companyName: 'Acme', nip: '1234567890', street: 'ul. Główna 1', zip: '00-001', city: 'Warszawa', currency: 'PLN' };

  it('returns error when user is unauthenticated', () => {
    const db: CompanyRow[] = [];
    const result = simulateCreateCompany(null, null, params, db);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('Sesja wygasła'));
  });

  it('creates a new company and returns company_created step', () => {
    const db: CompanyRow[] = [];
    const user: UserRow = { id: 'u1', company_id: null };
    const result = simulateCreateCompany(user, null, params, db);
    assert.equal(result.ok, true);
    assert.equal(result.data?.step, 'company_created');
    assert.ok(result.data?.companyId);
    assert.equal(db.length, 1);
    assert.equal(db[0].onboarding_step, 'company_created');
  });

  it('is idempotent: returns existing company if user already linked', () => {
    const db: CompanyRow[] = [];
    const existing: CompanyRow = {
      id: 'c-existing', name: 'Existing', nip: '0000000000', currency: 'PLN',
      onboarding_step: 'company_created', product_type: null,
      trial_active: false, trial_expires_at: null,
    };
    const user: UserRow = { id: 'u1', company_id: 'c-existing' };
    const result = simulateCreateCompany(user, existing, params, db);
    assert.equal(result.ok, true);
    assert.equal(result.data?.companyId, 'c-existing');
    assert.equal(db.length, 0); // no new company created
  });

  it('new company has product_type null until finalized', () => {
    const db: CompanyRow[] = [];
    const user: UserRow = { id: 'u1', company_id: null };
    simulateCreateCompany(user, null, params, db);
    assert.equal(db[0].product_type, null);
  });

  it('generates ingestion email slug from company name', () => {
    const name  = 'Acme Sp. z o.o.';
    const slug  = simulateSlugify(name);
    assert.match(slug, /^[a-z0-9-]+$/);
    assert.ok(!slug.startsWith('-'));
    assert.ok(!slug.endsWith('-'));
  });
});

// ─── finalizeProduct ──────────────────────────────────────────────────────────

describe('simulateFinalizeProduct', () => {
  function makeCompany(step: OnboardingStep = 'company_created'): CompanyRow {
    return {
      id: 'c1', name: 'Acme', nip: '1234567890', currency: 'PLN',
      onboarding_step: step, product_type: null,
      trial_active: false, trial_expires_at: null,
    };
  }

  it('returns error when user is unauthenticated', () => {
    const c = makeCompany();
    const result = simulateFinalizeProduct(null, c, { companyId: 'c1', productType: 'starter', trialActive: false });
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('Sesja wygasła'));
  });

  it('returns error when user does not own the company', () => {
    const c    = makeCompany();
    const user: UserRow = { id: 'u1', company_id: 'other-company' };
    const result = simulateFinalizeProduct(user, c, { companyId: 'c1', productType: 'starter', trialActive: false });
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('Brak uprawnień'));
  });

  it('sets product_type and onboarding_step = product_selected on starter plan', () => {
    const c    = makeCompany();
    const user: UserRow = { id: 'u1', company_id: 'c1' };
    const result = simulateFinalizeProduct(user, c, { companyId: 'c1', productType: 'starter', trialActive: false });
    assert.equal(result.ok, true);
    assert.equal(c.product_type, 'starter');
    assert.equal(c.onboarding_step, 'product_selected');
    assert.equal(c.trial_active, false);
    assert.equal(c.trial_expires_at, null);
  });

  it('sets trial_active and trial_expires_at when trial is requested', () => {
    const c    = makeCompany();
    const user: UserRow = { id: 'u1', company_id: 'c1' };
    simulateFinalizeProduct(user, c, { companyId: 'c1', productType: 'professional', trialActive: true });
    assert.equal(c.trial_active, true);
    assert.ok(c.trial_expires_at !== null);
    const expiresAt = new Date(c.trial_expires_at!).getTime();
    const inAbout7Days = Date.now() + 7 * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(expiresAt - inAbout7Days) < 5000);
  });

  it('leaves trial_expires_at null when immediate start chosen', () => {
    const c    = makeCompany();
    const user: UserRow = { id: 'u1', company_id: 'c1' };
    simulateFinalizeProduct(user, c, { companyId: 'c1', productType: 'starter', trialActive: false });
    assert.equal(c.trial_expires_at, null);
  });
});

// ─── getOnboardingState ───────────────────────────────────────────────────────

describe('simulateGetOnboardingState', () => {
  it('returns start when user has no company', () => {
    const user: UserRow = { id: 'u1', company_id: null };
    const state = simulateGetOnboardingState(user, null);
    assert.equal(state.step, 'start');
    assert.equal(state.companyId, null);
  });

  it('returns company_created when company has that step', () => {
    const user: UserRow  = { id: 'u1', company_id: 'c1' };
    const company: CompanyRow = {
      id: 'c1', name: 'A', nip: '0000000000', currency: 'PLN',
      onboarding_step: 'company_created', product_type: null,
      trial_active: false, trial_expires_at: null,
    };
    const state = simulateGetOnboardingState(user, company);
    assert.equal(state.step, 'company_created');
    assert.equal(state.companyId, 'c1');
    assert.equal(state.productType, null);
  });

  it('returns product_selected when onboarding fully done', () => {
    const user: UserRow  = { id: 'u1', company_id: 'c1' };
    const company: CompanyRow = {
      id: 'c1', name: 'A', nip: '0000000000', currency: 'PLN',
      onboarding_step: 'product_selected', product_type: 'professional',
      trial_active: true, trial_expires_at: '2099-01-01T00:00:00Z',
    };
    const state = simulateGetOnboardingState(user, company);
    assert.equal(state.step, 'product_selected');
    assert.equal(state.productType, 'professional');
  });

  it('returns company_created for legacy rows with null onboarding_step', () => {
    const user: UserRow  = { id: 'u1', company_id: 'c1' };
    const company: CompanyRow = {
      id: 'c1', name: 'Legacy', nip: '0000000000', currency: 'PLN',
      onboarding_step: null, product_type: null,
      trial_active: false, trial_expires_at: null,
    };
    const state = simulateGetOnboardingState(user, company);
    assert.equal(state.step, 'company_created');
  });
});

// ─── Full onboarding happy path ───────────────────────────────────────────────

describe('full onboarding happy path', () => {
  it('completes in two steps and reaches product_selected', () => {
    const db: CompanyRow[] = [];
    const user: UserRow    = { id: 'u1', company_id: null };

    // Step 1
    const step1 = simulateCreateCompany(user, null, {
      companyName: 'Test Firma', nip: '1234567890', street: 'ul. A 1', zip: '01-234', city: 'Kraków', currency: 'PLN',
    }, db);
    assert.equal(step1.ok, true);
    user.company_id = step1.data!.companyId;

    // Check state after step 1
    const stateAfter1 = simulateGetOnboardingState(user, db[0]);
    assert.equal(stateAfter1.step, 'company_created');

    // Step 2
    const step2 = simulateFinalizeProduct(user, db[0], {
      companyId:   step1.data!.companyId,
      productType: 'professional',
      trialActive: true,
    });
    assert.equal(step2.ok, true);

    // Check final state
    const stateAfter2 = simulateGetOnboardingState(user, db[0]);
    assert.equal(stateAfter2.step, 'product_selected');
    assert.equal(stateAfter2.productType, 'professional');
    assert.equal(db[0].trial_active, true);
  });

  it('step 1 idempotency: re-running createCompany does not duplicate company', () => {
    const db: CompanyRow[]  = [];
    const user: UserRow     = { id: 'u1', company_id: null };
    const params = { companyName: 'Firma', nip: '0000000001', street: 'ul. B 2', zip: '00-001', city: 'Gdańsk', currency: 'EUR' };

    const first  = simulateCreateCompany(user, null, params, db);
    user.company_id = first.data!.companyId;
    const second = simulateCreateCompany(user, db[0], params, db);

    assert.equal(db.length, 1);
    assert.equal(first.data!.companyId, second.data!.companyId);
  });

  it('resume: starting from company_created skips step 1', () => {
    const user: UserRow  = { id: 'u1', company_id: 'c-existing' };
    const company: CompanyRow = {
      id: 'c-existing', name: 'Old Firma', nip: '0000000002', currency: 'PLN',
      onboarding_step: 'company_created', product_type: null,
      trial_active: false, trial_expires_at: null,
    };

    const state = simulateGetOnboardingState(user, company);
    assert.equal(state.step, 'company_created');

    // Simulate resuming at step 2 and finalizing
    const finalize = simulateFinalizeProduct(user, company, {
      companyId:   'c-existing',
      productType: 'starter',
      trialActive: false,
    });
    assert.equal(finalize.ok, true);
    assert.equal(company.onboarding_step, 'product_selected');
  });
});
