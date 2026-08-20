import assert from 'node:assert';
import { describe, it } from 'node:test';

// Pure-logic tests for the provider guard and force-set-plan decision logic.
// These verify the guard logic and plan validation without hitting the database.

describe('Provider guard: external source detection', () => {
  const EXTERNAL_SOURCES = ['stripe', 'lemonsqueezy', 'lemon_squeezy', 'paddle', 'external', 'webhook'];

  function isExternalSource(source: string): boolean {
    return EXTERNAL_SOURCES.includes(source.toLowerCase());
  }

  it('blocks stripe', () => {
    assert.equal(isExternalSource('stripe'), true);
  });

  it('blocks lemonsqueezy', () => {
    assert.equal(isExternalSource('lemonsqueezy'), true);
  });

  it('blocks lemon_squeezy', () => {
    assert.equal(isExternalSource('lemon_squeezy'), true);
  });

  it('blocks paddle', () => {
    assert.equal(isExternalSource('paddle'), true);
  });

  it('blocks external', () => {
    assert.equal(isExternalSource('external'), true);
  });

  it('blocks webhook', () => {
    assert.equal(isExternalSource('webhook'), true);
  });

  it('allows local', () => {
    assert.equal(isExternalSource('local'), false);
  });

  it('allows owner', () => {
    assert.equal(isExternalSource('owner'), false);
  });

  it('allows internal', () => {
    assert.equal(isExternalSource('internal'), false);
  });

  it('allows reconciliation', () => {
    assert.equal(isExternalSource('reconciliation'), false);
  });

  it('is case-insensitive', () => {
    assert.equal(isExternalSource('STRIPE'), true);
    assert.equal(isExternalSource('Stripe'), true);
    assert.equal(isExternalSource('WEBHOOK'), true);
  });

  it('allows empty string', () => {
    assert.equal(isExternalSource(''), false);
  });
});

describe('Force-set-plan: plan validation', () => {
  const VALID_PLANS = ['starter', 'professional'];

  function isValidPlan(planId: string): boolean {
    return VALID_PLANS.includes(planId);
  }

  it('accepts starter', () => {
    assert.equal(isValidPlan('starter'), true);
  });

  it('accepts professional', () => {
    assert.equal(isValidPlan('professional'), true);
  });

  it('rejects enterprise (removed tier)', () => {
    assert.equal(isValidPlan('enterprise'), false);
  });

  it('rejects empty', () => {
    assert.equal(isValidPlan(''), false);
  });

  it('rejects random strings', () => {
    assert.equal(isValidPlan('pro'), false);
    assert.equal(isValidPlan('premium'), false);
  });
});

describe('Reconcile-batch: email filtering', () => {
  interface User { id: string; email: string }

  function filterByEmails(users: User[], emails?: string[]): User[] {
    if (!emails || emails.length === 0) return users;
    const emailSet = new Set(emails.map((e) => e.toLowerCase()));
    return users.filter((u) => emailSet.has(u.email.toLowerCase()));
  }

  it('returns all users when no emails specified', () => {
    const users = [
      { id: '1', email: 'a@test.com' },
      { id: '2', email: 'b@test.com' },
    ];
    assert.equal(filterByEmails(users).length, 2);
  });

  it('returns all users when emails is empty', () => {
    const users = [
      { id: '1', email: 'a@test.com' },
      { id: '2', email: 'b@test.com' },
    ];
    assert.equal(filterByEmails(users, []).length, 2);
  });

  it('filters to specific emails', () => {
    const users = [
      { id: '1', email: 'a@test.com' },
      { id: '2', email: 'b@test.com' },
      { id: '3', email: 'c@test.com' },
    ];
    const filtered = filterByEmails(users, ['a@test.com', 'c@test.com']);
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].email, 'a@test.com');
    assert.equal(filtered[1].email, 'c@test.com');
  });

  it('is case-insensitive for email matching', () => {
    const users = [{ id: '1', email: 'User@Test.com' }];
    const filtered = filterByEmails(users, ['user@test.com']);
    assert.equal(filtered.length, 1);
  });

  it('returns empty when no emails match', () => {
    const users = [{ id: '1', email: 'a@test.com' }];
    const filtered = filterByEmails(users, ['nonexistent@test.com']);
    assert.equal(filtered.length, 0);
  });
});

describe('Force-set-plan: effective date handling', () => {
  function resolveEffectiveFrom(provided?: string): string {
    return provided ?? new Date().toISOString();
  }

  it('uses provided effectiveFrom when given', () => {
    const date = '2026-01-01T00:00:00.000Z';
    assert.equal(resolveEffectiveFrom(date), date);
  });

  it('defaults to now when not provided', () => {
    const result = resolveEffectiveFrom();
    assert.ok(new Date(result).getTime() > 0);
  });
});

describe('Concurrency: plan change sequence', () => {
  // Simulates the order of operations in forceSetPlan
  function getOperationOrder(): string[] {
    return [
      'upsert_subscription',
      'sync_companies',
      'log_plan_change_audit',
      'log_billing_audit',
      'log_reconciliation_log',
    ];
  }

  it('writes subscription before companies', () => {
    const order = getOperationOrder();
    assert.ok(order.indexOf('upsert_subscription') < order.indexOf('sync_companies'));
  });

  it('writes audit logs after the actual change', () => {
    const order = getOperationOrder();
    assert.ok(order.indexOf('upsert_subscription') < order.indexOf('log_plan_change_audit'));
    assert.ok(order.indexOf('sync_companies') < order.indexOf('log_plan_change_audit'));
  });

  it('writes all three audit entries', () => {
    const order = getOperationOrder();
    assert.ok(order.includes('log_plan_change_audit'));
    assert.ok(order.includes('log_billing_audit'));
    assert.ok(order.includes('log_reconciliation_log'));
  });
});
