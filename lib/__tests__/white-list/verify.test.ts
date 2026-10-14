import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { verifyOnWhiteList } from '../../../lib/white-list/verify';

const originalFetch = globalThis.fetch;

function mockResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

beforeEach(() => {
  globalThis.fetch = (() => {}) as unknown as typeof fetch;
});

after(() => {
  globalThis.fetch = originalFetch;
});

// Valid 26-digit Polish bank account: 61 1020 1234 5678 9012 3456 7890
const VALID_IBAN_PL = 'PL61 1020 1234 5678 9012 3456 7890';
const VALID_NRB = '61102012345678901234567890';
const VALID_NIP = '5210000000';

describe('verifyOnWhiteList', () => {
  it('returns VALID when account is assigned to the vendor', async () => {
    (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>) =
      async () => mockResponse({
        result: {
          subject: { nip: VALID_NIP, name: 'Test Sp. z o.o.' },
          accountStatus: 'Posiada',
          accounts: [{ bankAccount: VALID_NRB }],
        },
      });

    const result = await verifyOnWhiteList(VALID_NIP, VALID_IBAN_PL, '2026-10-14');

    assert.equal(result.status, 'VALID');
    assert.equal(result.companyName, 'Test Sp. z o.o.');
    assert.equal(result.taxId, VALID_NIP);
    assert.equal(result.bankAccount, VALID_NRB);
  });

  it('returns VALID for the Ministry accountAssigned TAK response', async () => {
    (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>) =
      async () => mockResponse({
        result: {
          accountAssigned: 'TAK',
          requestDateTime: '14-10-2026 13:06:40',
          requestId: 'test-request-id',
        },
      });

    const result = await verifyOnWhiteList('5212897517', 'PL15109016940000000119960665', null);

    assert.equal(result.status, 'VALID');
    assert.equal(result.taxId, '5212897517');
    assert.equal(result.bankAccount, '15109016940000000119960665');
  });

  it('returns INVALID for the Ministry accountAssigned NIE response', async () => {
    (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>) =
      async () => mockResponse({ result: { accountAssigned: 'NIE' } });

    const result = await verifyOnWhiteList('5212897517', '15109016940000000119960665', null);

    assert.equal(result.status, 'INVALID');
  });

  it('returns VALID with plain NRB (no PL prefix)', async () => {
    (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>) =
      async () => mockResponse({
        result: {
          subject: { nip: VALID_NIP, name: 'Test Sp. z o.o.' },
          accountStatus: 'Posiada',
        },
      });

    const result = await verifyOnWhiteList(VALID_NIP, VALID_NRB, '2026-10-14');

    assert.equal(result.status, 'VALID');
    assert.equal(result.bankAccount, VALID_NRB);
  });

  it('returns INVALID when company found but account not assigned', async () => {
    (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>) =
      async () => mockResponse({
        result: {
          subject: { nip: VALID_NIP, name: 'Test Sp. z o.o.' },
          accountStatus: 'Nie posiada',
          accounts: [],
        },
      });

    const result = await verifyOnWhiteList(VALID_NIP, VALID_IBAN_PL, '2026-10-14');

    assert.equal(result.status, 'INVALID');
    assert.equal(result.companyName, 'Test Sp. z o.o.');
  });

  it('returns NOT_FOUND when API returns 404', async () => {
    (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>) =
      async () => mockResponse({ error: 'Not found' }, 404);

    const result = await verifyOnWhiteList('9999999999', VALID_IBAN_PL, '2026-10-14');

    assert.equal(result.status, 'NOT_FOUND');
    assert.equal(result.companyName, null);
  });

  it('returns NOT_FOUND when subject is missing', async () => {
    (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>) =
      async () => mockResponse({ result: {} });

    const result = await verifyOnWhiteList('9999999999', VALID_IBAN_PL, '2026-10-14');

    assert.equal(result.status, 'NOT_FOUND');
  });

  it('returns ERROR when fetch throws', async () => {
    (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>) =
      async () => { throw new Error('Network timeout'); };

    const result = await verifyOnWhiteList(VALID_NIP, VALID_IBAN_PL, '2026-10-14');

    assert.equal(result.status, 'ERROR');
    assert.ok(result.message.includes('Network timeout'));
  });

  it('returns ERROR for invalid NIP', async () => {
    const result = await verifyOnWhiteList('12', VALID_IBAN_PL, '2026-10-14');

    assert.equal(result.status, 'ERROR');
  });

  it('returns ERROR for bank account with wrong digit count (too short)', async () => {
    const result = await verifyOnWhiteList(VALID_NIP, '12345678', '2026-10-14');

    assert.equal(result.status, 'ERROR');
    assert.ok(result.message.includes('26 digits'));
  });

  it('returns ERROR for bank account with too many digits', async () => {
    const result = await verifyOnWhiteList(VALID_NIP, '123456789012345678901234567890', '2026-10-14');

    assert.equal(result.status, 'ERROR');
    assert.ok(result.message.includes('26 digits'));
  });

  it('returns ERROR when API returns 500', async () => {
    (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>) =
      async () => mockResponse({ error: 'Server error' }, 500);

    const result = await verifyOnWhiteList(VALID_NIP, VALID_IBAN_PL, '2026-10-14');

    assert.equal(result.status, 'ERROR');
    assert.ok(result.message.includes('500'));
  });
});
