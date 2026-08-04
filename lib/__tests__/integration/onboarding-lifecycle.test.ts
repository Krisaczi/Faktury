/**
 * Integration tests for the full onboarding and product-plan lifecycle.
 *
 * These tests exercise multi-step flows by wiring together the simulated
 * implementations of createCompany, finalizeProduct, enforceUserSlot,
 * enforceInvoicing, and the company card builder —
 * all in a shared in-memory state store so state changes from one step
 * are visible to the next.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/integration/onboarding-lifecycle.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Shared state store ───────────────────────────────────────────────────────

interface Company {
  id:               string;
  name:             string;
  nip:              string;
  street:           string;
  zip:              string;
  city:             string;
  currency:         string;
  product_type:     'starter' | 'professional' | null;
  onboarding_step:  'company_created' | 'product_selected' | null;
  subscription_status: string;
}

interface User {
  id:         string;
  company_id: string | null;
  role:       'owner' | 'accountant';
  active:     boolean;
  email:      string;
}

interface Store {
  companies:     Map<string, Company>;
  users:         Map<string, User>;
  nextId:        number;
}

function makeStore(): Store {
  return {
    companies:     new Map(),
    users:         new Map(),
    nextId:        1,
  };
}

// ─── Simulated action implementations ────────────────────────────────────────

function simCreateCompany(
  store: Store,
  callerId: string,
  params: { companyName: string; nip: string; street: string; zip: string; city: string; currency: string },
): { ok: true; companyId: string } | { ok: false; error: string } {
  const caller = store.users.get(callerId);
  if (!caller) return { ok: false, error: 'Unauthenticated' };
  if (caller.company_id) {
    return { ok: true, companyId: caller.company_id };
  }

  if (!params.companyName || params.companyName.length < 2)
    return { ok: false, error: 'Nazwa musi mieć co najmniej 2 znaki' };
  if (!/^\d{10}$/.test(params.nip))
    return { ok: false, error: 'NIP musi mieć dokładnie 10 cyfr' };
  if (!params.street || params.street.length < 3)
    return { ok: false, error: 'Podaj ulicę i numer' };
  if (!/^\d{2}-\d{3}$/.test(params.zip))
    return { ok: false, error: 'Format kodu: XX-XXX' };
  if (!params.city || params.city.length < 2)
    return { ok: false, error: 'Podaj miejscowość' };

  const id = `company-${store.nextId++}`;
  store.companies.set(id, {
    id,
    name:               params.companyName,
    nip:                params.nip,
    street:             params.street,
    zip:                params.zip,
    city:               params.city,
    currency:           params.currency,
    product_type:       null,
    onboarding_step:    'company_created',
    subscription_status: 'pending',
  });
  caller.company_id = id;
  return { ok: true, companyId: id };
}

function simFinalizeProduct(
  store: Store,
  callerId: string,
  params: { companyId: string; productType: 'starter' | 'professional' },
): { ok: true } | { ok: false; error: string } {
  const caller = store.users.get(callerId);
  if (!caller || caller.company_id !== params.companyId)
    return { ok: false, error: 'Brak uprawnień do tej firmy.' };

  const company = store.companies.get(params.companyId);
  if (!company) return { ok: false, error: 'Firma nie istnieje.' };

  company.product_type        = params.productType;
  company.subscription_status = 'active';
  company.onboarding_step     = 'product_selected';
  return { ok: true };
}

function simGetCompanyCard(store: Store, companyId: string) {
  const company = store.companies.get(companyId);
  if (!company) return null;

  const activeUsers = Array.from(store.users.values()).filter(
    (u) => u.company_id === companyId && u.active,
  ).length;

  const allowedUserLimit =
    company.product_type === 'professional' ? 3 :
    company.product_type === 'starter'      ? 1 :
    null;

  return {
    company_id:         companyId,
    company_name:       company.name,
    product_type:       company.product_type,
    current_user_count: activeUsers,
    allowed_user_limit: allowedUserLimit,
    invoicing_enabled:  company.product_type === 'professional',
    onboarding_step:    company.onboarding_step,
  };
}

function simEnforceUserSlot(
  store: Store,
  companyId: string,
): { allowed: boolean; error?: string } {
  const company = store.companies.get(companyId);
  if (!company) return { allowed: false, error: 'Firma nie istnieje.' };

  const usersLimit =
    company.product_type === 'professional' ? 3 :
    company.product_type === 'starter'      ? 1 :
    null;

  if (usersLimit === null) return { allowed: true };

  const activeCount = Array.from(store.users.values()).filter(
    (u) => u.company_id === companyId && u.active,
  ).length;

  if (activeCount < usersLimit) return { allowed: true };

  const msg = usersLimit === 1
    ? 'Plan Starter pozwala na 1 użytkownika. Przejdź na Professional, aby dodać więcej.'
    : `Plan Professional pozwala na ${usersLimit} użytkowników. Skontaktuj się z właścicielem.`;

  return { allowed: false, error: msg };
}

function simEnforceInvoicing(
  store: Store,
  companyId: string,
): { allowed: boolean; error?: string } {
  const company = store.companies.get(companyId);
  if (!company) return { allowed: false, error: 'Firma nie istnieje.' };
  if (company.product_type === 'professional') return { allowed: true };
  return {
    allowed: false,
    error:   'Fakturowanie jest dostępne tylko w planie Professional.',
  };
}

function simAddUser(
  store: Store,
  companyId: string,
  email: string,
): { ok: boolean; userId?: string; error?: string } {
  const slot = simEnforceUserSlot(store, companyId);
  if (!slot.allowed) return { ok: false, error: slot.error };

  const id = `user-${store.nextId++}`;
  store.users.set(id, { id, company_id: companyId, role: 'accountant', active: true, email });
  return { ok: true, userId: id };
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const VALID_COMPANY = {
  companyName: 'Acme Sp. z o.o.',
  nip:         '1234567890',
  street:      'ul. Główna 1',
  zip:         '00-001',
  city:        'Warszawa',
  currency:    'PLN',
};

let store: Store;

function seedOwner(s: Store, email = 'owner@acme.pl'): string {
  const id = `owner-${s.nextId++}`;
  s.users.set(id, { id, company_id: null, role: 'owner', active: true, email });
  return id;
}

// ─── AC-1: Company creation requires all fields ───────────────────────────────

describe('AC-1 Company creation validation', () => {
  beforeEach(() => { store = makeStore(); });

  it('rejects missing company name', () => {
    const ownerId = seedOwner(store);
    const r = simCreateCompany(store, ownerId, { ...VALID_COMPANY, companyName: 'A' });
    assert.equal(r.ok, false);
  });

  it('rejects NIP with fewer than 10 digits', () => {
    const ownerId = seedOwner(store);
    const r = simCreateCompany(store, ownerId, { ...VALID_COMPANY, nip: '12345' });
    assert.equal(r.ok, false);
  });

  it('rejects NIP with letters', () => {
    const ownerId = seedOwner(store);
    const r = simCreateCompany(store, ownerId, { ...VALID_COMPANY, nip: '123456789A' });
    assert.equal(r.ok, false);
  });

  it('rejects invalid zip format', () => {
    const ownerId = seedOwner(store);
    const r = simCreateCompany(store, ownerId, { ...VALID_COMPANY, zip: '00001' });
    assert.equal(r.ok, false);
  });

  it('rejects short street', () => {
    const ownerId = seedOwner(store);
    const r = simCreateCompany(store, ownerId, { ...VALID_COMPANY, street: 'ul' });
    assert.equal(r.ok, false);
  });

  it('rejects short city', () => {
    const ownerId = seedOwner(store);
    const r = simCreateCompany(store, ownerId, { ...VALID_COMPANY, city: 'X' });
    assert.equal(r.ok, false);
  });

  it('rejects unauthenticated caller', () => {
    const r = simCreateCompany(store, 'nonexistent', VALID_COMPANY);
    assert.equal(r.ok, false);
    assert.ok(r.ok === false && r.error.includes('Unauthenticated'));
  });

  it('accepts all valid fields and creates company row', () => {
    const ownerId = seedOwner(store);
    const r = simCreateCompany(store, ownerId, VALID_COMPANY);
    assert.equal(r.ok, true);
    if (r.ok) {
      const company = store.companies.get(r.companyId)!;
      assert.equal(company.name,  VALID_COMPANY.companyName);
      assert.equal(company.nip,   VALID_COMPANY.nip);
      assert.equal(company.onboarding_step, 'company_created');
      assert.equal(company.product_type, null);
    }
  });

  it('links owner user to the created company', () => {
    const ownerId = seedOwner(store);
    const r = simCreateCompany(store, ownerId, VALID_COMPANY);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(store.users.get(ownerId)!.company_id, r.companyId);
    }
  });

  it('is idempotent: second call returns existing company without creating new one', () => {
    const ownerId = seedOwner(store);
    const r1 = simCreateCompany(store, ownerId, VALID_COMPANY);
    const r2 = simCreateCompany(store, ownerId, VALID_COMPANY);
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    assert.equal(store.companies.size, 1);
    if (r1.ok && r2.ok) assert.equal(r1.companyId, r2.companyId);
  });
});

// ─── AC-2: Product selection sets correct DB fields ──────────────────────────

describe('AC-2 Product selection persists correct fields', () => {
  beforeEach(() => { store = makeStore(); });

  function setup() {
    const ownerId = seedOwner(store);
    const r = simCreateCompany(store, ownerId, VALID_COMPANY);
    assert.equal(r.ok, true);
    return { ownerId, companyId: r.ok ? r.companyId : '' };
  }

  it('sets product_type = starter and onboarding_step = product_selected', () => {
    const { ownerId, companyId } = setup();
    simFinalizeProduct(store, ownerId, { companyId, productType: 'starter' });
    const c = store.companies.get(companyId)!;
    assert.equal(c.product_type,    'starter');
    assert.equal(c.onboarding_step, 'product_selected');
    assert.equal(c.subscription_status, 'active');
  });

  it('sets product_type = professional and onboarding_step = product_selected', () => {
    const { ownerId, companyId } = setup();
    simFinalizeProduct(store, ownerId, { companyId, productType: 'professional' });
    const c = store.companies.get(companyId)!;
    assert.equal(c.product_type, 'professional');
    assert.equal(c.subscription_status, 'active');
  });

  it('rejects finalization from user who does not own company', () => {
    const { companyId } = setup();
    const otherId = seedOwner(store, 'other@x.pl');
    const r = simFinalizeProduct(store, otherId, { companyId, productType: 'starter' });
    assert.equal(r.ok, false);
  });
});

// ─── AC-3: Full onboarding flow ───────────────────────────────────────────────

describe('AC-3 Full onboarding happy path', () => {
  beforeEach(() => { store = makeStore(); });

  it('owner reaches product_selected after two steps', () => {
    const ownerId = seedOwner(store);

    const step1 = simCreateCompany(store, ownerId, VALID_COMPANY);
    assert.equal(step1.ok, true);
    if (!step1.ok) return;

    const step2 = simFinalizeProduct(store, ownerId, {
      companyId:   step1.companyId,
      productType: 'professional',
    });
    assert.equal(step2.ok, true);

    const card = simGetCompanyCard(store, step1.companyId);
    assert.ok(card);
    assert.equal(card!.onboarding_step,  'product_selected');
    assert.equal(card!.product_type,     'professional');
    assert.equal(card!.invoicing_enabled, true);
  });

  it('company card correctly reflects starter plan after onboarding', () => {
    const ownerId  = seedOwner(store);
    const { companyId } = (() => {
      const r = simCreateCompany(store, ownerId, VALID_COMPANY);
      assert.equal(r.ok, true);
      return r.ok ? { companyId: r.companyId } : { companyId: '' };
    })();
    simFinalizeProduct(store, ownerId, { companyId, productType: 'starter' });

    const card = simGetCompanyCard(store, companyId);
    assert.equal(card!.allowed_user_limit, 1);
    assert.equal(card!.invoicing_enabled,  false);
    assert.equal(card!.current_user_count, 1);
  });
});

// ─── AC-4: Starter plan blocks second user ────────────────────────────────────

describe('AC-4 Starter plan user limit enforcement', () => {
  beforeEach(() => { store = makeStore(); });

  function setupStarterCompany() {
    const ownerId = seedOwner(store);
    const r = simCreateCompany(store, ownerId, VALID_COMPANY);
    assert.equal(r.ok, true);
    const companyId = r.ok ? r.companyId : '';
    simFinalizeProduct(store, ownerId, { companyId, productType: 'starter' });
    return { ownerId, companyId };
  }

  it('allows the first (owner) user slot to be occupied', () => {
    const { companyId } = setupStarterCompany();
    const check = simEnforceUserSlot(store, companyId);
    assert.equal(check.allowed, false);
  });

  it('blocks adding an accountant when Starter slot is full', () => {
    const { companyId } = setupStarterCompany();
    const r = simAddUser(store, companyId, 'acc@x.pl');
    assert.equal(r.ok, false);
    assert.ok(r.error?.includes('Starter'));
  });

  it('error message includes upgrade path to Professional', () => {
    const { companyId } = setupStarterCompany();
    const r = simAddUser(store, companyId, 'acc@x.pl');
    assert.ok(r.error?.includes('Professional'));
  });

  it('company card reports allowed_user_limit = 1', () => {
    const { companyId } = setupStarterCompany();
    const card = simGetCompanyCard(store, companyId)!;
    assert.equal(card.allowed_user_limit, 1);
  });
});

// ─── AC-5: Professional plan allows up to 3 users ────────────────────────────

describe('AC-5 Professional plan user limit enforcement', () => {
  beforeEach(() => { store = makeStore(); });

  function setupProCompany() {
    const ownerId = seedOwner(store);
    const r = simCreateCompany(store, ownerId, VALID_COMPANY);
    assert.equal(r.ok, true);
    const companyId = r.ok ? r.companyId : '';
    simFinalizeProduct(store, ownerId, { companyId, productType: 'professional' });
    return { ownerId, companyId };
  }

  it('allows adding a second user (owner + 1 accountant)', () => {
    const { companyId } = setupProCompany();
    const r = simAddUser(store, companyId, 'acc1@x.pl');
    assert.equal(r.ok, true);
  });

  it('allows adding a third user (owner + 2 accountants)', () => {
    const { companyId } = setupProCompany();
    simAddUser(store, companyId, 'acc1@x.pl');
    const r = simAddUser(store, companyId, 'acc2@x.pl');
    assert.equal(r.ok, true);
  });

  it('blocks adding a fourth user (limit is 3)', () => {
    const { companyId } = setupProCompany();
    simAddUser(store, companyId, 'acc1@x.pl');
    simAddUser(store, companyId, 'acc2@x.pl');
    const r = simAddUser(store, companyId, 'acc3@x.pl');
    assert.equal(r.ok, false);
    assert.ok(r.error?.includes('Professional'));
  });

  it('error message mentions contacting owner (not upgrade CTA)', () => {
    const { companyId } = setupProCompany();
    simAddUser(store, companyId, 'acc1@x.pl');
    simAddUser(store, companyId, 'acc2@x.pl');
    const r = simAddUser(store, companyId, 'acc3@x.pl');
    assert.ok(r.error?.includes('Skontaktuj się'));
  });

  it('company card reports allowed_user_limit = 3', () => {
    const { companyId } = setupProCompany();
    const card = simGetCompanyCard(store, companyId)!;
    assert.equal(card.allowed_user_limit, 3);
  });
});

// ─── AC-6: Invoicing access control ──────────────────────────────────────────

describe('AC-6 Invoicing access control', () => {
  beforeEach(() => { store = makeStore(); });

  function setupCompany(productType: 'starter' | 'professional') {
    const ownerId = seedOwner(store);
    const r = simCreateCompany(store, ownerId, VALID_COMPANY);
    assert.equal(r.ok, true);
    const companyId = r.ok ? r.companyId : '';
    simFinalizeProduct(store, ownerId, { companyId, productType });
    return companyId;
  }

  it('allows invoicing for Professional plan', () => {
    const companyId = setupCompany('professional');
    const result = simEnforceInvoicing(store, companyId);
    assert.equal(result.allowed, true);
  });

  it('blocks invoicing for Starter plan', () => {
    const companyId = setupCompany('starter');
    const result = simEnforceInvoicing(store, companyId);
    assert.equal(result.allowed, false);
    assert.ok(result.error?.includes('Professional'));
  });

  it('company card shows invoicing_enabled = true for Professional', () => {
    const companyId = setupCompany('professional');
    assert.equal(simGetCompanyCard(store, companyId)!.invoicing_enabled, true);
  });

  it('company card shows invoicing_enabled = false for Starter', () => {
    const companyId = setupCompany('starter');
    assert.equal(simGetCompanyCard(store, companyId)!.invoicing_enabled, false);
  });
});

// ─── AC-7: Company card accuracy ─────────────────────────────────────────────

describe('AC-7 Company card accuracy', () => {
  beforeEach(() => { store = makeStore(); });

  it('reports current_user_count = 1 immediately after owner onboards', () => {
    const ownerId = seedOwner(store);
    const r = simCreateCompany(store, ownerId, VALID_COMPANY);
    assert.equal(r.ok, true);
    const companyId = r.ok ? r.companyId : '';
    simFinalizeProduct(store, ownerId, { companyId, productType: 'starter' });
    const card = simGetCompanyCard(store, companyId)!;
    assert.equal(card.current_user_count, 1);
  });

  it('reports current_user_count = 2 after adding one accountant on Professional', () => {
    const ownerId = seedOwner(store);
    const r = simCreateCompany(store, ownerId, VALID_COMPANY);
    assert.equal(r.ok, true);
    const companyId = r.ok ? r.companyId : '';
    simFinalizeProduct(store, ownerId, { companyId, productType: 'professional' });
    simAddUser(store, companyId, 'acc@x.pl');
    const card = simGetCompanyCard(store, companyId)!;
    assert.equal(card.current_user_count, 2);
  });

  it('company card product_type stays null until product selected', () => {
    const ownerId = seedOwner(store);
    const r = simCreateCompany(store, ownerId, VALID_COMPANY);
    assert.equal(r.ok, true);
    const companyId = r.ok ? r.companyId : '';
    const card = simGetCompanyCard(store, companyId)!;
    assert.equal(card.product_type, null);
    assert.equal(card.allowed_user_limit, null);
  });
});
