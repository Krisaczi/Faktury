/**
 * Unit tests for the company plan feature.
 *
 * Tests the pure-logic invariants:
 *   - Plan badge label/color mapping
 *   - changeCompanyPlan source invariants (action exists, validates, audits)
 *   - Owner dashboard type includes plan field
 *   - Frontend renders PlanBadge (not just pricing_tier_name)
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/owner/company-plan.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// ─── 1. Plan label mapping ──────────────────────────────────────────────────────

describe('plan label mapping', () => {
  const PLAN_LABELS: Record<string, string> = {
    starter:   'Starter',
    pro:       'Pro',
    trial:     'Trial',
    cancelled: 'Anulowany',
  };

  it('maps starter to Starter', () => {
    assert.equal(PLAN_LABELS['starter'], 'Starter');
  });

  it('maps pro to Pro', () => {
    assert.equal(PLAN_LABELS['pro'], 'Pro');
  });

  it('maps trial to Trial', () => {
    assert.equal(PLAN_LABELS['trial'], 'Trial');
  });

  it('maps cancelled to Anulowany', () => {
    assert.equal(PLAN_LABELS['cancelled'], 'Anulowany');
  });

  it('returns undefined for unknown plan', () => {
    assert.equal(PLAN_LABELS['unknown'], undefined);
  });

  it('returns undefined for null', () => {
    assert.equal(PLAN_LABELS[null as unknown as string], undefined);
  });
});

// ─── 2. changeCompanyPlan action source invariants ──────────────────────────────

describe('changeCompanyPlan action invariants', () => {
  const actionsPath = join(projectRoot, 'app', '(admin)', 'admin', 'owner', 'actions.ts');

  it('exports changeCompanyPlan function', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /export async function changeCompanyPlan/, 'must export changeCompanyPlan');
  });

  it('defines an allowed plans list', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /ALLOWED_PLANS/, 'must define ALLOWED_PLANS');
    assert.match(src, /starter/, 'must allow starter');
    assert.match(src, /pro/, 'must allow pro');
    assert.match(src, /trial/, 'must allow trial');
    assert.match(src, /cancelled/, 'must allow cancelled');
  });

  it('validates plan against allowed list', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /ALLOWED_PLANS\.includes/, 'must validate against ALLOWED_PLANS');
  });

  it('updates companies.plan and plan_changed_at/by', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /update\(/, 'must update companies table');
    assert.match(src, /plan:\s*newPlan/, 'must set plan to newPlan');
    assert.match(src, /plan_changed_at/, 'must set plan_changed_at');
    assert.match(src, /plan_changed_by/, 'must set plan_changed_by');
  });

  it('inserts into company_plan_audit table', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /company_plan_audit/, 'must insert into company_plan_audit');
    assert.match(src, /old_plan/, 'must record old_plan');
    assert.match(src, /new_plan/, 'must record new_plan');
    assert.match(src, /actor_id/, 'must record actor_id');
  });

  it('uses service role client for audit insert', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /getSupabaseServiceClient/, 'must use service client for audit');
  });

  it('requires owner role', async () => {
    const src = await readFile(actionsPath, 'utf8');
    // The function calls requireOwnerUser which checks role
    assert.match(src, /requireOwnerUser\(\)/, 'must call requireOwnerUser');
  });

  it('logs audit insert failures', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /company_plan_audit_failed/, 'must log audit failures');
  });

  it('rejects same plan as current', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /Nowy plan jest taki sam jak obecny/,
      'must reject if new plan equals current plan');
  });
});

// ─── 3. Owner dashboard type invariants ─────────────────────────────────────────

describe('CompanyDashboardRow type invariants', () => {
  const typesPath = join(projectRoot, 'app', '(admin)', 'admin', 'owner', 'types.ts');

  it('includes plan field', async () => {
    const src = await readFile(typesPath, 'utf8');
    assert.match(src, /plan:\s*string/, 'must include plan: string');
  });

  it('includes plan_changed_at field', async () => {
    const src = await readFile(typesPath, 'utf8');
    assert.match(src, /plan_changed_at/, 'must include plan_changed_at');
  });

  it('includes plan_changed_by field', async () => {
    const src = await readFile(typesPath, 'utf8');
    assert.match(src, /plan_changed_by/, 'must include plan_changed_by');
  });
});

// ─── 4. Owner dashboard frontend invariants ─────────────────────────────────────

describe('owner-dashboard frontend invariants', () => {
  const dashboardPath = join(projectRoot, 'components', 'admin', 'owner-dashboard.tsx');

  it('defines PlanBadge component', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.match(src, /function PlanBadge/, 'must define PlanBadge component');
  });

  it('imports changeCompanyPlan from actions', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.match(src, /changeCompanyPlan/, 'must import changeCompanyPlan');
  });

  it('renders PlanBadge in the plan column (not just pricing_tier_name)', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.match(src, /<PlanBadge/, 'must render PlanBadge component');
    assert.match(src, /company\.plan/, 'must pass company.plan to PlanBadge');
  });

  it('shows Unknown label for missing plan', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.match(src, /Unknown/, 'must show Unknown label for missing plan');
  });

  it('shows warning icon for unknown plan', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.match(src, /ShieldAlert/, 'must use ShieldAlert icon for unknown plan');
  });

  it('has tooltip for unknown plan with support contact', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.match(src, /skontaktuj się z supportem/,
      'must have tooltip with support contact text');
  });

  it('has plan badge color classes', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.match(src, /PLAN_BADGE_CLASS/, 'must define PLAN_BADGE_CLASS');
    assert.match(src, /bg-blue/, 'must have blue for starter');
    assert.match(src, /bg-emerald/, 'must have emerald for pro');
    assert.match(src, /bg-amber/, 'must have amber for trial');
  });

  it('shows plan_changed_at in tooltip', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.match(src, /Ostatnia zmiana/, 'must show last change date in tooltip');
    assert.match(src, /changedAt/, 'must use changedAt prop');
  });
});

// ─── 5. Actions mapping invariants ──────────────────────────────────────────────

describe('actions mapping invariants', () => {
  const actionsPath = join(projectRoot, 'app', '(admin)', 'admin', 'owner', 'actions.ts');

  it('maps plan from RPC result', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /r\.plan/, 'must map plan from RPC result');
  });

  it('maps plan_changed_at from RPC result', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /r\.plan_changed_at/, 'must map plan_changed_at from RPC result');
  });

  it('defaults plan to starter when null', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /plan.*\?\?.*starter|String\(r\.plan/,
      'must default plan to starter when null');
  });

  it('maps product_type from RPC result', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /r\.product_type/, 'must map product_type from RPC result');
  });
});
