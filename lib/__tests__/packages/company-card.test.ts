/**
 * Unit tests for getCompanyCard business logic.
 *
 * Strategy: inline simulation of the data-assembly and derived-flag logic
 * so no live DB, auth, or server is required.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/packages/company-card.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductType = 'starter' | 'professional' | null;

interface CompanyRow {
  id:               string;
  name:             string;
  nip:              string | null;
  product_type:     ProductType;
  trial_active:     boolean;
  trial_expires_at: string | null;
  is_active:        boolean;
}

interface CompanyCardData {
  company_id:          string;
  company_name:        string;
  nip:                 string | null;
  product_type:        ProductType;
  trial_active:        boolean;
  trial_expires_at:    string | null;
  trial_expired:       boolean;
  current_user_count:  number;
  allowed_user_limit:  number | null;
  invoicing_enabled:   boolean;
  is_active:           boolean;
}

// ─── Inline simulation of getCompanyCard assembly ─────────────────────────────

function buildCompanyCard(
  company: CompanyRow,
  activeUserCount: number,
  now: Date = new Date(),
): CompanyCardData {
  const productType    = company.product_type ?? null;
  const trialExpiresAt = company.trial_expires_at;
  const trialActive    = Boolean(company.trial_active);
  const trialExpired   = trialActive && trialExpiresAt !== null && new Date(trialExpiresAt) < now;

  const allowedUserLimit: number | null =
    productType === 'professional' ? 3 :
    productType === 'starter'      ? 1 :
    null;

  return {
    company_id:         company.id,
    company_name:       company.name,
    nip:                company.nip,
    product_type:       productType,
    trial_active:       trialActive,
    trial_expires_at:   trialExpiresAt,
    trial_expired:      trialExpired,
    current_user_count: activeUserCount,
    allowed_user_limit: allowedUserLimit,
    invoicing_enabled:  productType === 'professional',
    is_active:          Boolean(company.is_active),
  };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function inFuture(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString();
}
function inPast(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

// ─── Tests: product type resolution ──────────────────────────────────────────

describe('getCompanyCard — product type', () => {
  it('starter plan: 1 user limit, invoicing disabled', () => {
    const company: CompanyRow = {
      id: 'c1', name: 'ACME', nip: '1234567890',
      product_type: 'starter', trial_active: false, trial_expires_at: null, is_active: true,
    };
    const card = buildCompanyCard(company, 1);
    assert.equal(card.allowed_user_limit, 1);
    assert.equal(card.invoicing_enabled, false);
    assert.equal(card.product_type, 'starter');
  });

  it('professional plan: 3 user limit, invoicing enabled', () => {
    const company: CompanyRow = {
      id: 'c2', name: 'ACME Pro', nip: '0987654321',
      product_type: 'professional', trial_active: false, trial_expires_at: null, is_active: true,
    };
    const card = buildCompanyCard(company, 2);
    assert.equal(card.allowed_user_limit, 3);
    assert.equal(card.invoicing_enabled, true);
    assert.equal(card.product_type, 'professional');
  });

  it('null product type: no user limit, invoicing disabled', () => {
    const company: CompanyRow = {
      id: 'c3', name: 'New Co', nip: null,
      product_type: null, trial_active: false, trial_expires_at: null, is_active: true,
    };
    const card = buildCompanyCard(company, 0);
    assert.equal(card.allowed_user_limit, null);
    assert.equal(card.invoicing_enabled, false);
  });
});

// ─── Tests: trial_expired flag ────────────────────────────────────────────────

describe('getCompanyCard — trial_expired', () => {
  it('trial_expired = false when trial_active = false', () => {
    const company: CompanyRow = {
      id: 'c1', name: 'A', nip: null,
      product_type: 'starter', trial_active: false, trial_expires_at: inPast(1), is_active: true,
    };
    const card = buildCompanyCard(company, 0);
    assert.equal(card.trial_expired, false);
  });

  it('trial_expired = false when trial_active = true and expires in future', () => {
    const company: CompanyRow = {
      id: 'c2', name: 'B', nip: null,
      product_type: 'starter', trial_active: true, trial_expires_at: inFuture(5), is_active: true,
    };
    const card = buildCompanyCard(company, 0);
    assert.equal(card.trial_expired, false);
    assert.equal(card.trial_active, true);
  });

  it('trial_expired = true when trial_active = true but expiry is in past', () => {
    const company: CompanyRow = {
      id: 'c3', name: 'C', nip: null,
      product_type: 'professional', trial_active: true, trial_expires_at: inPast(2), is_active: true,
    };
    const card = buildCompanyCard(company, 0);
    assert.equal(card.trial_expired, true);
    assert.equal(card.trial_active, true);
  });

  it('trial_expired = false when trial_active = true and trial_expires_at = null', () => {
    const company: CompanyRow = {
      id: 'c4', name: 'D', nip: null,
      product_type: 'starter', trial_active: true, trial_expires_at: null, is_active: true,
    };
    const card = buildCompanyCard(company, 0);
    assert.equal(card.trial_expired, false);
  });

  it('uses the provided "now" for expiry comparison', () => {
    const expiresAt = '2025-01-10T00:00:00.000Z';
    const company: CompanyRow = {
      id: 'c5', name: 'E', nip: null,
      product_type: 'starter', trial_active: true, trial_expires_at: expiresAt, is_active: true,
    };
    // now = before expiry → not expired
    const cardBefore = buildCompanyCard(company, 0, new Date('2025-01-09T23:59:59Z'));
    assert.equal(cardBefore.trial_expired, false);
    // now = after expiry → expired
    const cardAfter = buildCompanyCard(company, 0, new Date('2025-01-11T00:00:00Z'));
    assert.equal(cardAfter.trial_expired, true);
  });
});

// ─── Tests: user counts ───────────────────────────────────────────────────────

describe('getCompanyCard — user counts', () => {
  it('passes through current_user_count', () => {
    const company: CompanyRow = {
      id: 'c1', name: 'X', nip: null,
      product_type: 'professional', trial_active: false, trial_expires_at: null, is_active: true,
    };
    const card = buildCompanyCard(company, 7);
    assert.equal(card.current_user_count, 7);
  });

  it('user count at limit for starter (1)', () => {
    const company: CompanyRow = {
      id: 'c2', name: 'Y', nip: null,
      product_type: 'starter', trial_active: false, trial_expires_at: null, is_active: true,
    };
    const card = buildCompanyCard(company, 1);
    assert.equal(card.current_user_count, 1);
    assert.equal(card.allowed_user_limit, 1);
  });
});

// ─── Tests: is_active passthrough ────────────────────────────────────────────

describe('getCompanyCard — is_active', () => {
  it('active company passes through', () => {
    const company: CompanyRow = {
      id: 'c1', name: 'A', nip: null,
      product_type: 'starter', trial_active: false, trial_expires_at: null, is_active: true,
    };
    assert.equal(buildCompanyCard(company, 0).is_active, true);
  });

  it('inactive company passes through', () => {
    const company: CompanyRow = {
      id: 'c2', name: 'B', nip: null,
      product_type: 'starter', trial_active: false, trial_expires_at: null, is_active: false,
    };
    assert.equal(buildCompanyCard(company, 0).is_active, false);
  });
});

// ─── Tests: NIP masking (UI helper logic) ─────────────────────────────────────

describe('NIP masking', () => {
  function maskNip(nip: string | null): string {
    if (!nip) return '—';
    if (nip.length < 4) return nip;
    return `••••••${nip.slice(-4)}`;
  }

  it('masks all but last 4 digits', () => {
    assert.equal(maskNip('1234567890'), '••••••7890');
  });

  it('returns em-dash for null', () => {
    assert.equal(maskNip(null), '—');
  });

  it('returns value unchanged if shorter than 4 chars', () => {
    assert.equal(maskNip('123'), '123');
  });
});
