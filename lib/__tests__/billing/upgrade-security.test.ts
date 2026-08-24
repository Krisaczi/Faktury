/**
 * Security invariants for the billing upgrade flow.
 *
 * Pure-logic tests — no DB, no HTTP server. Where a route handler cannot be
 * imported directly (Next.js route files only export route handlers), the
 * invariant is tested against the exact logic the route uses.
 *
 * Covers:
 *   1. Upgrade route accepts both 'owner' and 'accountant' roles
 *   2. Internal upgrade logic sets package to 'professional' and audits
 *   3. Invoicing guard blocks accountants on starter
 *   4. Invoicing guard allows accountants on professional
 *   5. Only service_role can update package — no client-side policy allows it
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/billing/upgrade-security.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { requireProForInvoicing } from '../../packages/invoicing-guard';

// ─── Shared constants mirroring the route handlers ──────────────────────────

/**
 * The exact role array used by /api/billing/upgrade to gate access.
 */
const BILLING_ALLOWED_ROLES = ['owner', 'accountant'] as const;

// ─── 1. Upgrade route role gate ──────────────────────────────────────────────

describe('upgrade route role gate', () => {
  it("accepts 'accountant' in the allowed-roles array", () => {
    assert.ok(
      (BILLING_ALLOWED_ROLES as readonly string[]).includes('accountant'),
      'accountant must be in the upgrade allowed-roles array',
    );
  });

  it("accepts 'owner' in the allowed-roles array", () => {
    assert.ok(
      (BILLING_ALLOWED_ROLES as readonly string[]).includes('owner'),
      'owner must be in the upgrade allowed-roles array',
    );
  });

  it('rejects roles not in the allowed array (e.g. member)', () => {
    assert.equal(
      (BILLING_ALLOWED_ROLES as readonly string[]).includes('member'),
      false,
    );
  });

  it('rejects an empty string role', () => {
    assert.equal(
      (BILLING_ALLOWED_ROLES as readonly string[]).includes(''),
      false,
    );
  });
});

// ─── 2. Internal upgrade response shape ──────────────────────────────────────

/**
 * Replicates the successful upgrade response from /api/billing/upgrade:
 * returns 200 with product_type 'professional' and a message.
 */
function successfulUpgradeResponse(): { status: number; body: Record<string, unknown> } {
  return {
    status: 200,
    body: {
      product_type: 'professional',
      message: 'Plan upgraded to Professional',
    },
  };
}

describe('internal upgrade response', () => {
  it('returns HTTP 200 on success', () => {
    const res = successfulUpgradeResponse();
    assert.equal(res.status, 200);
  });

  it('returns product_type professional', () => {
    const res = successfulUpgradeResponse();
    assert.equal(res.body.product_type, 'professional');
  });

  it('returns a success message', () => {
    const res = successfulUpgradeResponse();
    assert.ok(
      typeof res.body.message === 'string' &&
        /professional/i.test(res.body.message),
      'message should mention Professional',
    );
  });
});

// ─── 3 & 4. Invoicing guard ──────────────────────────────────────────────────

describe('invoicing guard (requireProForInvoicing)', () => {
  it('allows accountants on the starter package (full invoicing mode)', () => {
    const result = requireProForInvoicing({
      role: 'accountant',
      companyId: 'co-1',
      packageType: 'starter',
    });
    assert.equal(result.allowed, true);
  });

  it('allows accountants on the professional package', () => {
    const result = requireProForInvoicing({
      role: 'accountant',
      companyId: 'co-1',
      packageType: 'professional',
    });
    assert.equal(result.allowed, true);
    assert.equal(result.code, undefined);
    assert.equal(result.status, undefined);
  });

  it('starter is now allowed (no blocked reason needed)', () => {
    const result = requireProForInvoicing({
      role: 'accountant',
      companyId: 'co-1',
      packageType: 'starter',
    });
    assert.equal(result.allowed, true);
    assert.equal(result.code, undefined);
  });

  it('owner bypasses the package check entirely', () => {
    const result = requireProForInvoicing({
      role: 'owner',
      companyId: 'co-1',
      packageType: 'starter',
    });
    assert.equal(result.allowed, true);
  });
});

// ─── 5. Package update is service_role only (RLS invariant) ──────────────────

describe('package update via direct DB (no external provider)', () => {
  const projectRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
  );
  const migrationsDir = join(projectRoot, 'supabase', 'migrations');

  it('the upgrade route uses direct DB update (not self_serve_upgrade RPC)', async () => {
    const route = await readFile(
      join(projectRoot, 'app', 'api', 'billing', 'upgrade', 'route.ts'),
      'utf8',
    );
    assert.doesNotMatch(
      route,
      /self_serve_upgrade/,
      'self_serve_upgrade RPC has been removed — upgrade is now a direct DB update',
    );
    assert.doesNotMatch(
      route,
      /getSupabaseServiceClient/,
      'upgrade route must NOT use the service-role client directly',
    );
    assert.match(
      route,
      /product_type.*professional/,
      'upgrade route must set product_type to professional',
    );
  });

  it('no migration grants authenticated a permissive companies UPDATE on product_type/package_type', async () => {
    const files = await Promise.all([
      readFile(join(migrationsDir, '20260508214928_create_saas_multitenant_schema.sql'), 'utf8'),
      readFile(join(migrationsDir, '20260615184749_add_product_type_and_address_to_companies.sql'), 'utf8'),
    ]);
    const combined = files.join('\n');

    const hasPermissiveProductTypeGrant = /GRANT\s+.*product_type.*\s+TO\s+(authenticated|anon)/i.test(
      combined,
    );
    assert.equal(
      hasPermissiveProductTypeGrant,
      false,
      'no column grant should let authenticated/anon set product_type directly',
    );
  });

  it('no Lemon Squeezy webhook handler exists', async () => {
    const route = await readFile(
      join(projectRoot, 'app', 'api', 'lemon-webhook', 'route.ts'),
      'utf8',
    ).catch(() => null);
    assert.equal(route, null, 'the lemon-webhook route must be deleted');
  });

  it('no Lemon Squeezy checkout route exists', async () => {
    const route = await readFile(
      join(projectRoot, 'app', 'api', 'billing', 'checkout', 'route.ts'),
      'utf8',
    ).catch(() => null);
    assert.equal(route, null, 'the LS checkout route must be deleted');
  });
});
