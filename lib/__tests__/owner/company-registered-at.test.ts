/**
 * Unit tests for the company registration date feature.
 *
 * Tests invariants:
 *   - Date formatting helpers (fmtRegisteredDate, fmtIsoTimestamp)
 *   - Owner dashboard type includes registered_at, excludes product_type
 *   - Actions mapping includes registered_at
 *   - Frontend renders Registration Date column, not Produkt
 *   - Missing registered_at shows Unknown with warning
 *   - Sorting supports registered_at
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/owner/company-registered-at.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// ─── 1. Date formatting helpers ───────────────────────────────────────────────

describe('date formatting helpers', () => {
  const helpersPath = join(projectRoot, 'components', 'admin', 'owner-dashboard.tsx');

  it('defines fmtRegisteredDate', async () => {
    const src = await readFile(helpersPath, 'utf8');
    assert.match(src, /function fmtRegisteredDate/, 'must define fmtRegisteredDate');
  });

  it('uses dd.MM.yyyy format', async () => {
    const src = await readFile(helpersPath, 'utf8');
    assert.match(src, /dd\.MM\.yyyy/, 'must use dd.MM.yyyy format');
  });

  it('returns Unknown for null input', async () => {
    const src = await readFile(helpersPath, 'utf8');
    assert.match(src, /if \(!d\) return 'Unknown'/, 'must return Unknown for null');
  });

  it('defines fmtIsoTimestamp for tooltip', async () => {
    const src = await readFile(helpersPath, 'utf8');
    assert.match(src, /function fmtIsoTimestamp/, 'must define fmtIsoTimestamp');
  });
});

// ─── 2. Type invariants ───────────────────────────────────────────────────────

describe('CompanyDashboardRow type invariants', () => {
  const typesPath = join(projectRoot, 'app', '(admin)', 'admin', 'owner', 'types.ts');

  it('includes registered_at field', async () => {
    const src = await readFile(typesPath, 'utf8');
    assert.match(src, /registered_at:\s*string \| null/, 'must include registered_at: string | null');
  });

  it('no longer includes product_type field', async () => {
    const src = await readFile(typesPath, 'utf8');
    assert.doesNotMatch(src, /product_type/, 'must not include product_type');
  });
});

// ─── 3. Actions mapping invariants ────────────────────────────────────────────

describe('actions mapping invariants', () => {
  const actionsPath = join(projectRoot, 'app', '(admin)', 'admin', 'owner', 'actions.ts');

  it('maps registered_at from RPC result', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /r\.registered_at/, 'must map registered_at from RPC');
  });

  it('falls back to created_at when registered_at is null', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /r\.created_at/, 'must fall back to created_at');
  });

  it('does not map product_type from RPC', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.doesNotMatch(src, /r\.product_type/, 'must not map product_type');
  });
});

// ─── 4. Frontend column invariants ────────────────────────────────────────────

describe('owner-dashboard frontend column invariants', () => {
  const dashboardPath = join(projectRoot, 'components', 'admin', 'owner-dashboard.tsx');

  it('has Data rejestracji column header', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.match(src, /Data rejestracji/, 'must have Data rejestracji header');
  });

  it('no longer has Produkt column header', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.doesNotMatch(src, />Produkt</, 'must not have Produkt header');
  });

  it('renders time element with dateTime attribute', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.match(src, /<time/, 'must render <time> element');
    assert.match(src, /dateTime=/, 'must have dateTime attribute for accessibility');
  });

  it('shows Unknown with ShieldAlert for missing registered_at', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.match(src, /company_registered_at_missing/, 'must log missing registered_at');
    assert.match(src, /Registration date not set/, 'must have tooltip for missing date');
    assert.match(src, /Unknown/, 'must show Unknown text');
  });

  it('uses fmtRegisteredDate for display', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.match(src, /fmtRegisteredDate\(company\.registered_at\)/,
      'must call fmtRegisteredDate with company.registered_at');
  });

  it('uses fmtIsoTimestamp for tooltip', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.match(src, /fmtIsoTimestamp\(company\.registered_at\)/,
      'must call fmtIsoTimestamp for tooltip');
  });

  it('does not reference company.product_type', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.doesNotMatch(src, /company\.product_type/,
      'must not reference company.product_type');
  });

  it('supports sorting by registered_at', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.match(src, /'registered_at'/, 'must include registered_at in sort union');
    assert.match(src, /toggleSort\('registered_at'\)/, 'must call toggleSort with registered_at');
  });

  it('removes unused Star and Zap icon imports', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    const importLine = src.match(/from 'lucide-react'/)?.input?.split('\n')
      .find((l) => l.includes('lucide-react'));
    assert.ok(importLine, 'must have lucide-react import');
    assert.doesNotMatch(importLine!, /\bStar\b/, 'must not import Star');
    assert.doesNotMatch(importLine!, /\bZap\b/, 'must not import Zap');
  });
});
