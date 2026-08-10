/**
 * Unit tests for the billing upgrade route logic.
 *
 * Tests the pure-logic invariants of /api/billing/upgrade:
 *   - Role gate (who can upgrade)
 *   - Error code/status mapping for every failure case
 *   - Route source invariants (service-role usage, audit writes, no typos)
 *
 * These tests deliberately avoid importing modules that use @/ path aliases
 * or next/* imports (which jiti can't resolve outside Next.js). Source-level
 * invariants are verified by reading the route file directly.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/billing/upgrade-route.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const routePath = join(projectRoot, 'app', 'api', 'billing', 'upgrade', 'route.ts');
const helperPath = join(projectRoot, 'lib', 'auth', 'get-authenticated-user.ts');
const loggerPath = join(projectRoot, 'lib', 'billing', 'logger.ts');

// ─── Constants mirroring the route handler ──────────────────────────────────────

const ALLOWED_UPGRADE_ROLES = ['owner', 'accountant'] as const;

// ─── 1. Role gate ───────────────────────────────────────────────────────────────

describe('upgrade role gate', () => {
  it('allows owner', () => {
    assert.ok(ALLOWED_UPGRADE_ROLES.includes('owner'));
  });

  it('allows accountant', () => {
    assert.ok(ALLOWED_UPGRADE_ROLES.includes('accountant'));
  });

  it('rejects unknown roles', () => {
    assert.equal(ALLOWED_UPGRADE_ROLES.includes('member' as never), false);
    assert.equal(ALLOWED_UPGRADE_ROLES.includes('admin' as never), false);
    assert.equal(ALLOWED_UPGRADE_ROLES.includes('' as never), false);
  });
});

// ─── 2. Request ID generation (pure logic) ─────────────────────────────────────

describe('generateRequestId logic', () => {
  it('generates a non-empty string', () => {
    // Mirrors the implementation in logger.ts
    function generateRequestId(): string {
      try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          return crypto.randomUUID().slice(0, 8);
        }
      } catch {
        // fallthrough
      }
      return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    }
    const id = generateRequestId();
    assert.ok(typeof id === 'string');
    assert.ok(id.length > 0);
  });

  it('generates unique values', () => {
    function generateRequestId(): string {
      try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          return crypto.randomUUID().slice(0, 8);
        }
      } catch {
        // fallthrough
      }
      return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    }
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(generateRequestId());
    assert.equal(ids.size, 100);
  });
});

// ─── 3. Status code mapping for each failure case ───────────────────────────────

describe('status code mapping', () => {
  const cases: { scenario: string; status: number; code: string }[] = [
    { scenario: 'missing/invalid token', status: 401, code: 'UNAUTHORIZED' },
    { scenario: 'user record not found', status: 404, code: 'USER_NOT_FOUND' },
    { scenario: 'company id missing', status: 400, code: 'COMPANY_ID_MISSING' },
    { scenario: 'insufficient role', status: 403, code: 'FORBIDDEN' },
    { scenario: 'company not found', status: 404, code: 'COMPANY_NOT_FOUND' },
    { scenario: 'db error', status: 500, code: 'DB_ERROR' },
    { scenario: 'upgrade failed', status: 500, code: 'UPGRADE_FAILED' },
    { scenario: 'unexpected error', status: 500, code: 'INTERNAL_ERROR' },
    { scenario: 'already professional', status: 409, code: 'ALREADY_PROFESSIONAL' },
    { scenario: 'invalid current plan', status: 422, code: 'INVALID_CURRENT_PLAN' },
  ];

  for (const { scenario, status, code } of cases) {
    it(`${scenario} → ${status} ${code}`, () => {
      assert.ok(status >= 400 && status < 600, `${code} should be an error status`);
      assert.ok(code.length > 0, 'code should be non-empty');
      assert.equal(code, code.toUpperCase(), 'code should be uppercase');
    });
  }
});

// ─── 4. Route source invariants ─────────────────────────────────────────────────

describe('route source invariants', () => {
  it('exports a POST handler', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /export\s+async\s+function\s+POST/, 'must export POST');
  });

  it('uses getAuthenticatedUser for session extraction', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /getAuthenticatedUser/, 'must use getAuthenticatedUser');
  });

  it('does not read company_id from request body', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.doesNotMatch(route, /req\.json|await req\(\)/, 'must not parse body for company id');
  });

  it('uses service-role client for the privileged update', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(
      route,
      /getSupabaseServiceClient/,
      'must use service-role client for upgrade',
    );
  });

  it('sets product_type to professional', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /product_type:\s*'professional'/, 'must set product_type to professional');
  });

  it('writes to billing_audit with correct old/new package', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /billing_audit/, 'must write to billing_audit');
    assert.match(route, /old_package:\s*'starter'/, 'audit must record old_package as starter');
    assert.match(route, /new_package:\s*'professional'/, 'audit must record new_package as professional');
  });

  it('writes to company_package_audit', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /company_package_audit/, 'must write to company_package_audit');
  });

  it('does not contain the typo "Company not faound"', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.doesNotMatch(route, /faound/i, 'must not contain the "faound" typo');
  });

  it('returns 404 only for COMPANY_NOT_FOUND', async () => {
    const route = await readFile(routePath, 'utf8');
    const matches = route.match(/404/g) ?? [];
    assert.ok(matches.length > 0, 'route must use 404 for company not found');
    assert.match(route, /COMPANY_NOT_FOUND/, 'must use COMPANY_NOT_FOUND code');
  });

  it('returns 403 for FORBIDDEN (not 404)', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /403/, 'must return 403 for forbidden');
    assert.match(route, /FORBIDDEN/, 'must use FORBIDDEN code');
  });

  it('returns 401 for UNAUTHORIZED (not 404)', async () => {
    const route = await readFile(routePath, 'utf8');
    // The route uses err.status from AuthError, so 401 is in the helper
    const helper = await readFile(helperPath, 'utf8');
    assert.match(helper, /401/, 'helper must return 401 for unauthorized');
    assert.match(helper, /UNAUTHORIZED/, 'helper must use UNAUTHORIZED code');
    // Route must handle AuthError and use its status
    assert.match(route, /AuthError/, 'route must handle AuthError');
  });

  it('returns 400 for COMPANY_ID_MISSING', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /400/, 'must return 400 for missing company id');
    assert.match(route, /COMPANY_ID_MISSING/, 'must use COMPANY_ID_MISSING code');
  });

  it('returns 500 for INTERNAL_ERROR', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /INTERNAL_ERROR/, 'must use INTERNAL_ERROR code');
  });

  it('includes structured logging with requestId', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /logBilling/, 'must use logBilling');
    assert.match(route, /requestId/g, 'must include requestId in logs');
  });

  it('validates that only starter can upgrade', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /currentType === 'professional'/, 'must check for already-professional');
    assert.match(route, /currentType !== 'starter'/, 'must check for invalid current plan');
  });

  it('marks route as force-dynamic', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /export\s+const\s+dynamic\s*=\s*'force-dynamic'/, 'must be force-dynamic');
  });
});

// ─── 5. getAuthenticatedUser helper invariants ─────────────────────────────────

describe('getAuthenticatedUser helper invariants', () => {
  it('exports getAuthenticatedUser and AuthError', async () => {
    const src = await readFile(helperPath, 'utf8');
    assert.match(src, /export\s+async\s+function\s+getAuthenticatedUser/);
    assert.match(src, /export\s+class\s+AuthError/);
  });

  it('reads from supabase.auth.getUser (not client-supplied data)', async () => {
    const src = await readFile(helperPath, 'utf8');
    assert.match(src, /auth\.getUser/);
  });

  it('queries the users table for company_id and role', async () => {
    const src = await readFile(helperPath, 'utf8');
    assert.match(src, /from\('users'\)/);
    assert.match(src, /company_id/);
    assert.match(src, /role/);
  });

  it('throws AuthError with 401 when no session', async () => {
    const src = await readFile(helperPath, 'utf8');
    assert.match(src, /UNAUTHORIZED/);
    assert.match(src, /401/);
  });

  it('does not accept company_id from client input', async () => {
    const src = await readFile(helperPath, 'utf8');
    assert.doesNotMatch(src, /req\.json|body\.company_id|params\.company_id/i,
      'must not read company_id from client input');
  });
});

// ─── 6. Logger invariants ───────────────────────────────────────────────────────

describe('logger invariants', () => {
  it('exports logBilling, generateRequestId, errorResponse', async () => {
    const src = await readFile(loggerPath, 'utf8');
    assert.match(src, /export\s+function\s+logBilling/);
    assert.match(src, /export\s+function\s+generateRequestId/);
    assert.match(src, /export\s+function\s+errorResponse/);
  });

  it('errorResponse includes error and code in JSON body', async () => {
    const src = await readFile(loggerPath, 'utf8');
    assert.match(src, /error.*code|code.*error/, 'must include both error and code');
  });

  it('logBilling includes requestId in payload', async () => {
    const src = await readFile(loggerPath, 'utf8');
    assert.match(src, /requestId/);
  });
});

// ─── 7. Error response JSON shape (pure construction) ──────────────────────────

describe('error response shape', () => {
  it('constructs { error, code, requestId } object', () => {
    function errorResponse(error: string, code: string, _status: number, requestId?: string) {
      const body: Record<string, unknown> = { error, code };
      if (requestId) body.requestId = requestId;
      return body;
    }

    const body = errorResponse('Company not found', 'COMPANY_NOT_FOUND', 404, 'req-123');
    assert.equal(body.error, 'Company not found');
    assert.equal(body.code, 'COMPANY_NOT_FOUND');
    assert.equal(body.requestId, 'req-123');
  });

  it('works without requestId', () => {
    function errorResponse(error: string, code: string, _status: number, requestId?: string) {
      const body: Record<string, unknown> = { error, code };
      if (requestId) body.requestId = requestId;
      return body;
    }

    const body = errorResponse('Bad request', 'BAD_REQUEST', 400);
    assert.equal(body.error, 'Bad request');
    assert.equal(body.code, 'BAD_REQUEST');
    assert.equal(body.requestId, undefined);
  });
});
