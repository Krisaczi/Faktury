import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { verifyOnWhiteList } from '../../../lib/white-list/verify';

// Mock global fetch
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

describe('verifyOnWhiteList', () => {
  it('returns VALID when account is assigned to the vendor', async () => {
    (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>) =
      async () => mockResponse({
        result: {
          subject: { nip: '5210000000', name: 'Test Sp. z o.o.' },
          accountStatus: 'Posiada',
          accounts: [{ bankAccount: '69114012382444800352226545' }],
        },
      });

    const result = await verifyOnWhiteList('521-000-00-00', '69 1140 1238 2444 8003 5222 6545', '2026-10-14');

    assert.equal(result.status, 'VALID');
    assert.equal(result.companyName, 'Test Sp. z o.o.');
    assert.equal(result.taxId, '5210000000');
  });

  it('returns INVALID when company found but account not assigned', async () => {
    (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>) =
      async () => mockResponse({
        result: {
          subject: { nip: '5210000000', name: 'Test Sp. z o.o.' },
          accountStatus: 'Nie posiada',
          accounts: [],
        },
      });

    const result = await verifyOnWhiteList('5210000000', '69114012382444800352226545', '2026-10-14');

    assert.equal(result.status, 'INVALID');
    assert.equal(result.companyName, 'Test Sp. z o.o.');
  });

  it('returns NOT_FOUND when API returns 404', async () => {
    (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>) =
      async () => mockResponse({ error: 'Not found' }, 404);

    const result = await verifyOnWhiteList('9999999999', '69114012382444800352226545', '2026-10-14');

    assert.equal(result.status, 'NOT_FOUND');
    assert.equal(result.companyName, null);
  });

  it('returns NOT_FOUND when subject is missing', async () => {
    (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>) =
      async () => mockResponse({ result: {} });

    const result = await verifyOnWhiteList('9999999999', '69114012382444800352226545', '2026-10-14');

    assert.equal(result.status, 'NOT_FOUND');
  });

  it('returns ERROR when fetch throws', async () => {
    (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>) =
      async () => { throw new Error('Network timeout'); };

    const result = await verifyOnWhiteList('5210000000', '69114012382444800352226545', '2026-10-14');

    assert.equal(result.status, 'ERROR');
    assert.ok(result.message.includes('Network timeout'));
  });

  it('returns ERROR for invalid NIP', async () => {
    const result = await verifyOnWhiteList('12', '69114012382444800352226545', '2026-10-14');

    assert.equal(result.status, 'ERROR');
  });

  it('returns ERROR for invalid bank account', async () => {
    const result = await verifyOnWhiteList('5210000000', '123', '2026-10-14');

    assert.equal(result.status, 'ERROR');
  });

  it('returns ERROR when API returns 500', async () => {
    (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>) =
      async () => mockResponse({ error: 'Server error' }, 500);

    const result = await verifyOnWhiteList('5210000000', '69114012382444800352226545', '2026-10-14');

    assert.equal(result.status, 'ERROR');
    assert.ok(result.message.includes('500'));
  });
});
