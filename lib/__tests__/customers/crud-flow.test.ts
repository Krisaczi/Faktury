/**
 * Integration tests for customer CRUD flow.
 *
 * Tests the full lifecycle: create → search → update → delete,
 * plus validation failures and duplicate-NIP prevention.
 *
 * Uses simulated in-memory store to avoid live DB dependency.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/customers/crud-flow.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Simulated customer store + API ───────────────────────────────────────────

interface CustomerRecord {
  id:            string;
  companyId:     string;
  name:          string;
  nip:           string;
  street:        string | null;
  postalCode:    string | null;
  city:          string | null;
  country:       string;
  email:         string | null;
  phone:         string | null;
  lastUsedAt:    string | null;
  createdAt:     string;
  deletedAt:     string | null;
}

let store: CustomerRecord[];

function resetStore() {
  store = [];
}

function validateInput(input: { name?: string; nip?: string; address?: string; email?: string }) {
  const errors: Record<string, string[]> = {};
  if (!input.name || !input.name.trim()) errors.name = ['Nazwa firmy jest wymagana'];
  if (!input.nip || !input.nip.trim()) {
    errors.nip = ['NIP jest wymagany'];
  } else if (!/^\d{10}$/.test(input.nip.trim())) {
    errors.nip = ['NIP musi zawierać 10 cyfr'];
  }
  if (!input.address || !input.address.trim()) {
    errors.address = ['Adres jest wymagany'];
  } else if (input.address.trim().length < 3) {
    errors.address = ['Adres musi mieć min. 3 znaki'];
  }
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    errors.email = ['Nieprawidłowy e-mail'];
  }
  return Object.keys(errors).length === 0 ? null : errors;
}

function createCustomer(companyId: string, input: { name: string; nip: string; address: string; email?: string; phone?: string }): { status: number; body: Record<string, unknown> } {
  const validationErrors = validateInput(input);
  if (validationErrors) {
    return { status: 400, body: { error: 'Błąd walidacji', fieldErrors: validationErrors } };
  }

  // Check duplicate NIP
  const existing = store.find((c) => c.companyId === companyId && c.nip === input.nip && !c.deletedAt);
  if (existing) {
    return { status: 409, body: { error: 'Klient z tym numerem NIP już istnieje w bazie.' } };
  }

  const record: CustomerRecord = {
    id:         `cust-${store.length + 1}`,
    companyId,
    name:       input.name,
    nip:        input.nip,
    street:     input.address.split(',')[0]?.trim() ?? input.address,
    postalCode: input.address.match(/(\d{2}-\d{3})/)?.[1] ?? null,
    city:       input.address.split(',').slice(1).join(',').trim() || null,
    country:    'Polska',
    email:      input.email || null,
    phone:      input.phone || null,
    lastUsedAt: null,
    createdAt:   new Date().toISOString(),
    deletedAt:   null,
  };

  store.push(record);
  return { status: 201, body: { customer: record } };
}

function searchCustomers(companyId: string, query: string): CustomerRecord[] {
  let results = store.filter((c) => c.companyId === companyId && !c.deletedAt);
  if (query) {
    results = results.filter((c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.nip.includes(query),
    );
  }
  return results.sort((a, b) => {
    if (a.lastUsedAt && !b.lastUsedAt) return -1;
    if (!a.lastUsedAt && b.lastUsedAt) return 1;
    return a.name.localeCompare(b.name);
  });
}

function updateCustomer(companyId: string, id: string, input: { name: string; nip: string; address: string; email?: string; phone?: string }): { status: number; body: Record<string, unknown> } {
  const validationErrors = validateInput(input);
  if (validationErrors) {
    return { status: 400, body: { error: 'Błąd walidacji', fieldErrors: validationErrors } };
  }

  const dup = store.find((c) => c.companyId === companyId && c.nip === input.nip && c.id !== id && !c.deletedAt);
  if (dup) {
    return { status: 409, body: { error: 'Inny klient z tym numerem NIP już istnieje.' } };
  }

  const record = store.find((c) => c.id === id && c.companyId === companyId && !c.deletedAt);
  if (!record) {
    return { status: 404, body: { error: 'Klient nie został znaleziony.' } };
  }

  record.name  = input.name;
  record.nip   = input.nip;
  record.email = input.email || null;
  record.phone = input.phone || null;
  return { status: 200, body: { customer: record } };
}

function deleteCustomer(companyId: string, id: string): { status: number; body: Record<string, unknown> } {
  const record = store.find((c) => c.id === id && c.companyId === companyId && !c.deletedAt);
  if (!record) {
    return { status: 404, body: { error: 'Klient nie został znaleziony.' } };
  }
  record.deletedAt = new Date().toISOString();
  return { status: 200, body: { ok: true } };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Customer CRUD flow', () => {
  beforeEach(() => resetStore());

  it('creates a customer with valid input', () => {
    const res = createCustomer('co-1', {
      name: 'Firma ABC Sp. z o.o.',
      nip: '1234567890',
      address: 'ul. Testowa 1, 00-001 Warszawa',
      email: 'kontakt@abc.pl',
      phone: '+48 123 456 789',
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.customer);
    assert.equal((res.body.customer as CustomerRecord).name, 'Firma ABC Sp. z o.o.');
  });

  it('appears in search results after creation', () => {
    createCustomer('co-1', { name: 'Firma XYZ', nip: '1111111111', address: 'ul. Z 1, Warszawa' });
    const results = searchCustomers('co-1', 'XYZ');
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Firma XYZ');
  });

  it('prevents duplicate NIP on creation', () => {
    createCustomer('co-1', { name: 'Firma A', nip: '1234567890', address: 'ul. A 1, Warszawa' });
    const res = createCustomer('co-1', { name: 'Firma B', nip: '1234567890', address: 'ul. B 2, Kraków' });
    assert.equal(res.status, 409);
    assert.ok((res.body.error as string).includes('NIP'));
  });

  it('rejects missing required fields', () => {
    const res = createCustomer('co-1', { name: '', nip: '', address: '' });
    assert.equal(res.status, 400);
    const fe = res.body.fieldErrors as Record<string, string[]>;
    assert.ok(fe.name);
    assert.ok(fe.nip);
    assert.ok(fe.address);
  });

  it('rejects invalid NIP format', () => {
    const res = createCustomer('co-1', { name: 'Firma A', nip: '123', address: 'ul. A 1, Warszawa' });
    assert.equal(res.status, 400);
    const fe = res.body.fieldErrors as Record<string, string[]>;
    assert.ok(fe.nip[0].includes('10 cyfr'));
  });

  it('rejects invalid email', () => {
    const res = createCustomer('co-1', { name: 'Firma A', nip: '1234567890', address: 'ul. A 1, Warszawa', email: 'not-an-email' });
    assert.equal(res.status, 400);
    const fe = res.body.fieldErrors as Record<string, string[]>;
    assert.ok(fe.email);
  });

  it('updates an existing customer', () => {
    const { body } = createCustomer('co-1', { name: 'Old Name', nip: '1234567890', address: 'ul. A 1, Warszawa' });
    const id = (body.customer as CustomerRecord).id;

    const res = updateCustomer('co-1', id, { name: 'New Name', nip: '1234567890', address: 'ul. B 2, Kraków' });
    assert.equal(res.status, 200);
    assert.equal((res.body.customer as CustomerRecord).name, 'New Name');
  });

  it('prevents duplicate NIP on update (different customer)', () => {
    const { body: b1 } = createCustomer('co-1', { name: 'Firma A', nip: '1111111111', address: 'ul. A 1, Warszawa' });
    const { body: b2 } = createCustomer('co-1', { name: 'Firma B', nip: '2222222222', address: 'ul. B 2, Kraków' });
    const id1 = (b1.customer as CustomerRecord).id;
    const id2 = (b2.customer as CustomerRecord).id;

    // Try to update Firma B to have Firma A's NIP
    const res = updateCustomer('co-1', id2, { name: 'Firma B', nip: '1111111111', address: 'ul. B 2, Kraków' });
    assert.equal(res.status, 409);
  });

  it('allows updating same customer with same NIP', () => {
    const { body } = createCustomer('co-1', { name: 'Firma A', nip: '1111111111', address: 'ul. A 1, Warszawa' });
    const id = (body.customer as CustomerRecord).id;

    const res = updateCustomer('co-1', id, { name: 'Firma A Updated', nip: '1111111111', address: 'ul. A 1, Warszawa' });
    assert.equal(res.status, 200);
  });

  it('soft-deletes a customer', () => {
    const { body } = createCustomer('co-1', { name: 'Firma A', nip: '1234567890', address: 'ul. A 1, Warszawa' });
    const id = (body.customer as CustomerRecord).id;

    const res = deleteCustomer('co-1', id);
    assert.equal(res.status, 200);

    // Should not appear in search results
    const results = searchCustomers('co-1', '');
    assert.equal(results.length, 0);
  });

  it('returns 404 when deleting non-existent customer', () => {
    const res = deleteCustomer('co-1', 'nonexistent');
    assert.equal(res.status, 404);
  });

  it('isolates customers between companies', () => {
    createCustomer('co-1', { name: 'Firma A', nip: '1234567890', address: 'ul. A 1, Warszawa' });
    createCustomer('co-2', { name: 'Firma B', nip: '1234567890', address: 'ul. B 2, Kraków' });

    assert.equal(searchCustomers('co-1', '').length, 1);
    assert.equal(searchCustomers('co-2', '').length, 1);
    assert.equal(searchCustomers('co-1', 'Firma B').length, 0);
  });

  it('full lifecycle: create → search → update → delete', () => {
    // Create
    const { body: createdBody } = createCustomer('co-1', { name: 'Test Firma', nip: '1234567890', address: 'ul. Test 1, Warszawa', email: 'test@test.pl' });
    const id = (createdBody.customer as CustomerRecord).id;
    assert.equal(searchCustomers('co-1', 'Test').length, 1);

    // Update
    updateCustomer('co-1', id, { name: 'Updated Firma', nip: '1234567890', address: 'ul. New 2, Kraków' });
    assert.equal(searchCustomers('co-1', 'Updated').length, 1);
    assert.equal(searchCustomers('co-1', 'Test').length, 0);

    // Delete
    deleteCustomer('co-1', id);
    assert.equal(searchCustomers('co-1', '').length, 0);
  });
});
