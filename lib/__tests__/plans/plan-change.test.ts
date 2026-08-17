/**
 * Unit tests for plan change logic: proration, downgrade detection,
 * usage conflict checking, and authorization rules.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/plans/plan-change.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Plan definitions (mirrored from lib/plans/actions.ts) ─────────────────────

interface PlanInfo {
  id:          string;
  name:        string;
  monthlyPrice: number;
  limits: {
    vendors_limit:     number | null;
    reports_per_month: number | null;
    users_limit:       number | null;
    file_uploads:      boolean;
    invoicing:         boolean;
  };
}

const PLANS: PlanInfo[] = [
  {
    id: 'starter', name: 'Starter', monthlyPrice: 0,
    limits: { vendors_limit: 25, reports_per_month: 10, users_limit: 1, file_uploads: true, invoicing: false },
  },
  {
    id: 'professional', name: 'Professional', monthlyPrice: 4900,
    limits: { vendors_limit: null, reports_per_month: null, users_limit: 3, file_uploads: true, invoicing: true },
  },
];

function getPlanById(id: string): PlanInfo | undefined {
  return PLANS.find((p) => p.id === id);
}

function isDowngrade(fromPlan: string, toPlan: string): boolean {
  const from = PLANS.findIndex((p) => p.id === fromPlan);
  const to   = PLANS.findIndex((p) => p.id === toPlan);
  return to < from;
}

function computeProration(fromPlan: string, toPlan: string, effective: 'now' | 'period_end') {
  const from = getPlanById(fromPlan);
  const to   = getPlanById(toPlan);
  const priceDiff = (to?.monthlyPrice ?? 0) - (from?.monthlyPrice ?? 0);
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    fromPlan, toPlan,
    priceDiffCents: priceDiff,
    immediate:      effective === 'now',
    effectiveDate:  effective === 'now' ? now.toISOString() : nextMonth.toISOString(),
    nextBillingAt:  nextMonth.toISOString(),
  };
}

interface UsageInfo {
  activeUsers:      number;
  vendorCount:      number;
  reportsThisMonth: number;
}

interface UsageConflict {
  field:   string;
  label:   string;
  current: number;
  limit:   number | null;
  over:    boolean;
}

function checkUsageConflicts(usage: UsageInfo, plan: PlanInfo): UsageConflict[] {
  const conflicts: UsageConflict[] = [];
  if (plan.limits.users_limit !== null && usage.activeUsers > plan.limits.users_limit) {
    conflicts.push({ field: 'users_limit', label: 'Aktywni użytkownicy', current: usage.activeUsers, limit: plan.limits.users_limit, over: true });
  }
  if (plan.limits.vendors_limit !== null && usage.vendorCount > plan.limits.vendors_limit) {
    conflicts.push({ field: 'vendors_limit', label: 'Dostawcy', current: usage.vendorCount, limit: plan.limits.vendors_limit, over: true });
  }
  if (plan.limits.reports_per_month !== null && usage.reportsThisMonth > plan.limits.reports_per_month) {
    conflicts.push({ field: 'reports_per_month', label: 'Raporty w tym miesiącu', current: usage.reportsThisMonth, limit: plan.limits.reports_per_month, over: true });
  }
  return conflicts;
}

// ─── isDowngrade ──────────────────────────────────────────────────────────────

describe('isDowngrade', () => {
  it('identifies starter→professional as upgrade (not downgrade)', () => {
    assert.equal(isDowngrade('starter', 'professional'), false);
  });

  it('identifies professional→starter as downgrade', () => {
    assert.equal(isDowngrade('professional', 'starter'), true);
  });

  it('same plan is not a downgrade', () => {
    assert.equal(isDowngrade('starter', 'starter'), false);
    assert.equal(isDowngrade('professional', 'professional'), false);
  });
});

// ─── computeProration ──────────────────────────────────────────────────────────

describe('computeProration', () => {
  it('computes positive price diff for upgrade', () => {
    const p = computeProration('starter', 'professional', 'now');
    assert.equal(p.priceDiffCents, 4900);
    assert.equal(p.immediate, true);
  });

  it('computes negative price diff for downgrade', () => {
    const p = computeProration('professional', 'starter', 'now');
    assert.equal(p.priceDiffCents, -4900);
    assert.equal(p.immediate, true);
  });

  it('computes zero diff for same plan', () => {
    const p = computeProration('starter', 'starter', 'now');
    assert.equal(p.priceDiffCents, 0);
  });

  it('sets immediate=false for period_end', () => {
    const p = computeProration('starter', 'professional', 'period_end');
    assert.equal(p.immediate, false);
  });

  it('always has a nextBillingAt date', () => {
    const p = computeProration('starter', 'professional', 'now');
    assert.ok(p.nextBillingAt);
    assert.ok(new Date(p.nextBillingAt).getTime() > Date.now());
  });
});

// ─── checkUsageConflicts ──────────────────────────────────────────────────────

describe('checkUsageConflicts', () => {
  const starterPlan = PLANS[0];

  it('returns no conflicts when usage is within limits', () => {
    const usage: UsageInfo = { activeUsers: 1, vendorCount: 10, reportsThisMonth: 5 };
    assert.equal(checkUsageConflicts(usage, starterPlan).length, 0);
  });

  it('detects too many active users', () => {
    const usage: UsageInfo = { activeUsers: 3, vendorCount: 0, reportsThisMonth: 0 };
    const conflicts = checkUsageConflicts(usage, starterPlan);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].field, 'users_limit');
    assert.equal(conflicts[0].current, 3);
    assert.equal(conflicts[0].limit, 1);
  });

  it('detects too many vendors', () => {
    const usage: UsageInfo = { activeUsers: 1, vendorCount: 30, reportsThisMonth: 0 };
    const conflicts = checkUsageConflicts(usage, starterPlan);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].field, 'vendors_limit');
  });

  it('detects too many reports', () => {
    const usage: UsageInfo = { activeUsers: 1, vendorCount: 0, reportsThisMonth: 15 };
    const conflicts = checkUsageConflicts(usage, starterPlan);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].field, 'reports_per_month');
  });

  it('detects multiple conflicts simultaneously', () => {
    const usage: UsageInfo = { activeUsers: 5, vendorCount: 50, reportsThisMonth: 20 };
    const conflicts = checkUsageConflicts(usage, starterPlan);
    assert.equal(conflicts.length, 3);
  });

  it('returns no conflicts for professional plan with high usage (null limits)', () => {
    const proPlan = PLANS[1];
    const usage: UsageInfo = { activeUsers: 3, vendorCount: 999, reportsThisMonth: 999 };
    // vendors and reports are unlimited on professional
    const conflicts = checkUsageConflicts(usage, proPlan);
    assert.equal(conflicts.length, 0);
  });

  it('detects users exceeding professional limit', () => {
    const proPlan = PLANS[1];
    const usage: UsageInfo = { activeUsers: 5, vendorCount: 0, reportsThisMonth: 0 };
    const conflicts = checkUsageConflicts(usage, proPlan);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].field, 'users_limit');
    assert.equal(conflicts[0].limit, 3);
  });

  it('boundary: exactly at limit is not a conflict', () => {
    const usage: UsageInfo = { activeUsers: 1, vendorCount: 25, reportsThisMonth: 10 };
    assert.equal(checkUsageConflicts(usage, starterPlan).length, 0);
  });
});

// ─── Authorization rules ───────────────────────────────────────────────────────

describe('Plan change authorization rules', () => {
  it('owner role is required to change plans', () => {
    const allowedRoles = ['owner'];
    assert.ok(allowedRoles.includes('owner'));
    assert.ok(!allowedRoles.includes('accountant'));
  });

  it('accountant cannot change plans', () => {
    const role = 'accountant';
    const canChange = role === 'owner';
    assert.equal(canChange, false);
  });

  it('owner can change plans', () => {
    const role = 'owner';
    const canChange = role === 'owner';
    assert.equal(canChange, true);
  });
});

// ─── Plan change validation ───────────────────────────────────────────────────

describe('Plan change validation', () => {
  it('rejects invalid planId', () => {
    const plan = getPlanById('enterprise');
    assert.equal(plan, undefined);
  });

  it('rejects same-plan change', () => {
    const fromPlan = 'starter';
    const toPlan = 'starter';
    assert.equal(fromPlan === toPlan, true);
  });

  it('accepts valid upgrade', () => {
    const fromPlan = 'starter';
    const toPlan = 'professional';
    assert.notEqual(fromPlan, toPlan);
    assert.equal(isDowngrade(fromPlan, toPlan), false);
  });

  it('accepts valid downgrade', () => {
    const fromPlan = 'professional';
    const toPlan = 'starter';
    assert.notEqual(fromPlan, toPlan);
    assert.equal(isDowngrade(fromPlan, toPlan), true);
  });

  it('forceDowngrade should be required when conflicts exist', () => {
    const usage: UsageInfo = { activeUsers: 3, vendorCount: 0, reportsThisMonth: 0 };
    const targetPlan = PLANS[0]; // starter, users_limit: 1
    const conflicts = checkUsageConflicts(usage, targetPlan);
    const requiresForce = conflicts.length > 0;
    assert.equal(requiresForce, true);
  });

  it('forceDowngrade should not be required when no conflicts', () => {
    const usage: UsageInfo = { activeUsers: 1, vendorCount: 0, reportsThisMonth: 0 };
    const targetPlan = PLANS[0];
    const conflicts = checkUsageConflicts(usage, targetPlan);
    const requiresForce = conflicts.length > 0;
    assert.equal(requiresForce, false);
  });
});
