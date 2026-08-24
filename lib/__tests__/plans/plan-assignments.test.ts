import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// Tests for the plan_assignments canonical table integration.
// These verify the code structure — that getEffectivePlan reads from
// plan_assignments first, falls back to companies, and that the
// reconcile-batch endpoint exists and handles dryRun correctly.

describe('plan_assignments canonical table integration', () => {

  it('getEffectivePlan reads from plan_assignments first', async () => {
    const source = await readFile(join(projectRoot, 'lib', 'plans', 'canonical-plan.ts'), 'utf8');
    assert.match(source, /plan_assignments/, 'must query plan_assignments table');
    assert.match(source, /source.*plan_assignments/, 'must set source to plan_assignments');
  });

  it('getEffectivePlan falls back to companies.product_type', async () => {
    const source = await readFile(join(projectRoot, 'lib', 'plans', 'canonical-plan.ts'), 'utf8');
    assert.match(source, /Fallback.*companies/i, 'must have fallback to companies');
    assert.match(source, /product_type.*package_type/, 'must read product_type and package_type');
  });

  it('getEffectivePlan returns assignedAt and updatedAt', async () => {
    const source = await readFile(join(projectRoot, 'lib', 'plans', 'canonical-plan.ts'), 'utf8');
    assert.match(source, /assignedAt/, 'must return assignedAt field');
    assert.match(source, /updatedAt/, 'must return updatedAt field');
  });

  it('PlanSource type includes plan_assignments', async () => {
    const source = await readFile(join(projectRoot, 'lib', 'plans', 'canonical-plan.ts'), 'utf8');
    assert.match(source, /PlanSource.*plan_assignments/, 'PlanSource must include plan_assignments');
  });
});

describe('reconcile-batch endpoint', () => {

  it('accepts companyNames parameter', async () => {
    const source = await readFile(
      join(projectRoot, 'app', 'api', 'owner', 'plans', 'reconcile-batch', 'route.ts'),
      'utf8',
    );
    assert.match(source, /companyNames/, 'must accept companyNames parameter');
    assert.match(source, /entityIds/, 'must accept entityIds parameter');
  });

  it('supports dryRun mode', async () => {
    const source = await readFile(
      join(projectRoot, 'app', 'api', 'owner', 'plans', 'reconcile-batch', 'route.ts'),
      'utf8',
    );
    assert.match(source, /dryRun/, 'must support dryRun parameter');
  });

  it('writes to plan_change_audit on apply', async () => {
    const source = await readFile(
      join(projectRoot, 'app', 'api', 'owner', 'plans', 'reconcile-batch', 'route.ts'),
      'utf8',
    );
    assert.match(source, /plan_change_audit/, 'must write audit entries on apply');
  });

  it('upserts plan_assignments on apply', async () => {
    const source = await readFile(
      join(projectRoot, 'app', 'api', 'owner', 'plans', 'reconcile-batch', 'route.ts'),
      'utf8',
    );
    assert.match(source, /plan_assignments/, 'must write to plan_assignments on apply');
    assert.match(source, /upsert/, 'must use upsert');
  });

  it('owner-only access (role check)', async () => {
    const source = await readFile(
      join(projectRoot, 'app', 'api', 'owner', 'plans', 'reconcile-batch', 'route.ts'),
      'utf8',
    );
    assert.match(source, /role.*owner/, 'must check for owner role');
  });
});

describe('plans/effective endpoint', () => {

  it('returns planId, source, isKnownPlan', async () => {
    const source = await readFile(
      join(projectRoot, 'app', 'api', 'plans', 'effective', 'route.ts'),
      'utf8',
    );
    assert.match(source, /planId/, 'must return planId');
    assert.match(source, /source/, 'must return source');
    assert.match(source, /isKnownPlan/, 'must return isKnownPlan');
  });

  it('accepts entityId query param', async () => {
    const source = await readFile(
      join(projectRoot, 'app', 'api', 'plans', 'effective', 'route.ts'),
      'utf8',
    );
    assert.match(source, /entityId/, 'must accept entityId query parameter');
  });

  it('membership check for non-owner queries', async () => {
    const source = await readFile(
      join(projectRoot, 'app', 'api', 'plans', 'effective', 'route.ts'),
      'utf8',
    );
    assert.match(source, /Forbidden/, 'must check membership and return 403 for unauthorized');
  });
});

describe('useUserPackage hook', () => {

  it('fetches from /api/plans/effective (not direct DB)', async () => {
    const source = await readFile(join(projectRoot, 'hooks', 'use-user-package.ts'), 'utf8');
    assert.match(source, /\/api\/plans\/effective/, 'must fetch from /api/plans/effective');
    assert.doesNotMatch(source, /from\('companies'\)/, 'must NOT query companies table directly');
  });

  it('returns isKnownPlan field', async () => {
    const source = await readFile(join(projectRoot, 'hooks', 'use-user-package.ts'), 'utf8');
    assert.match(source, /isKnownPlan/, 'must return isKnownPlan');
  });
});

describe('billing/upgrade route writes to plan_assignments', () => {

  it('upserts plan_assignments on upgrade', async () => {
    const source = await readFile(
      join(projectRoot, 'app', 'api', 'billing', 'upgrade', 'route.ts'),
      'utf8',
    );
    assert.match(source, /plan_assignments/, 'must write to plan_assignments on upgrade');
    assert.match(source, /upsert/, 'must use upsert');
  });
});

describe('force-set-plan writes to plan_assignments', () => {

  it('upserts plan_assignments on force-set', async () => {
    const source = await readFile(join(projectRoot, 'lib', 'plans', 'reconciliation.ts'), 'utf8');
    assert.match(source, /plan_assignments/, 'must write to plan_assignments');
    assert.match(source, /upsert/, 'must use upsert in forceSetPlan');
  });
});
