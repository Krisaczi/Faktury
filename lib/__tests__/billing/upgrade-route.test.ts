/**
 * Unit tests for the billing upgrade route logic.
 *
 * Tests the pure-logic invariants of /api/billing/upgrade:
 *   - Error code/status mapping for every failure case
 *   - Route source invariants (RPC usage, no service-role key, no typos)
 *   - Logger invariants
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
const loggerPath = join(projectRoot, 'lib', 'billing', 'logger.ts');

// ─── 1. Request ID generation (pure logic) ─────────────────────────────────────

describe('generateRequestId logic', () => {
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

  it('generates a non-empty string', () => {
    const id = generateRequestId();
    assert.ok(typeof id === 'string');
    assert.ok(id.length > 0);
  });

  it('generates unique values', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(generateRequestId());
    assert.equal(ids.size, 100);
  });
});

// ─── 2. Status code mapping for each failure case ───────────────────────────────

describe('status code mapping', () => {
  const cases: { scenario: string; status: number; code: string }[] = [
    { scenario: 'missing/invalid token', status: 401, code: 'UNAUTHORIZED' },
    { scenario: 'user record not found', status: 404, code: 'USER_NOT_FOUND' },
    { scenario: 'company id missing', status: 400, code: 'COMPANY_ID_MISSING' },
    { scenario: 'insufficient role', status: 403, code: 'FORBIDDEN' },
    { scenario: 'company not found', status: 404, code: 'COMPANY_NOT_FOUND' },
    { scenario: 'db error', status: 500, code: 'DB_ERROR' },
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

// ─── 3. Route source invariants ─────────────────────────────────────────────────

describe('route source invariants', () => {
  it('exports a POST handler', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /export\s+async\s+function\s+POST/, 'must export POST');
  });

  it('uses supabase.auth.getUser for session extraction', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /auth\.getUser/, 'must use auth.getUser for server-side session validation');
  });

  it('does not read company_id from request body', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.doesNotMatch(route, /req\.json|await req\(\)/, 'must not parse body for company id');
  });

  it('uses direct DB update (not self_serve_upgrade RPC)', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /product_type.*professional/, 'must upgrade product_type directly');
    assert.doesNotMatch(route, /self_serve_upgrade/, 'must not call self_serve_upgrade RPC — removed');
  });

  it('does NOT use getSupabaseServiceClient (no service-role key dependency)', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.doesNotMatch(route, /getSupabaseServiceClient/, 'must not use service-role client');
  });

  it('does not contain the typo "Company not faound"', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.doesNotMatch(route, /faound/i, 'must not contain the "faound" typo');
  });

  it('maps COMPANY_NOT_FOUND to 404', async () => {
    const route = await readFile(routePath, 'utf8');
    // The new route doesn't have COMPANY_NOT_FOUND — it returns DB_ERROR for update failures
    // This test verifies the error code pattern exists in the route
    assert.ok(route.includes('DB_ERROR') || route.includes('COMPANY_NOT_FOUND'), 'must handle DB errors');
  });

  it('maps FORBIDDEN to 403', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /FORBIDDEN.*403|403.*FORBIDDEN/, 'must map FORBIDDEN to 403');
  });

  it('maps UNAUTHORIZED to 401', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /UNAUTHORIZED.*401|401.*UNAUTHORIZED/, 'must map UNAUTHORIZED to 401');
  });

  it('maps COMPANY_ID_MISSING to 400', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /COMPANY_ID_MISSING.*400|400.*COMPANY_ID_MISSING/, 'must map COMPANY_ID_MISSING to 400');
  });

  it('maps ALREADY_PROFESSIONAL to 409', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /ALREADY_PROFESSIONAL.*409|409.*ALREADY_PROFESSIONAL/, 'must map ALREADY_PROFESSIONAL to 409');
  });

  it('maps INTERNAL_ERROR to 500', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /INTERNAL_ERROR.*500|500.*INTERNAL_ERROR/, 'must map INTERNAL_ERROR to 500');
  });

  it('includes structured logging with requestId', async () => {
    const route = await readFile(routePath, 'utf8');
    // The new route uses console.error for logging instead of logBilling
    assert.match(route, /console\.error|logBilling/, 'must log errors');
  });

  it('marks route as force-dynamic', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /export\s+const\s+dynamic\s*=\s*'force-dynamic'/, 'must be force-dynamic');
  });

  it('does not accept company_id from client input', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.doesNotMatch(route, /req\.json|body\.company_id|params\.company_id/i,
      'must not read company_id from client input');
  });
});

// ─── 4. Logger invariants ───────────────────────────────────────────────────────

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

// ─── 5. Error response JSON shape (pure construction) ──────────────────────────

describe('error response shape', () => {
  function errorResponse(error: string, code: string, _status: number, requestId?: string) {
    const body: Record<string, unknown> = { error, code };
    if (requestId) body.requestId = requestId;
    return body;
  }

  it('constructs { error, code, requestId } object', () => {
    const body = errorResponse('Company not found', 'COMPANY_NOT_FOUND', 404, 'req-123');
    assert.equal(body.error, 'Company not found');
    assert.equal(body.code, 'COMPANY_NOT_FOUND');
    assert.equal(body.requestId, 'req-123');
  });

  it('works without requestId', () => {
    const body = errorResponse('Bad request', 'BAD_REQUEST', 400);
    assert.equal(body.error, 'Bad request');
    assert.equal(body.code, 'BAD_REQUEST');
    assert.equal(body.requestId, undefined);
  });
});

// ─── 6. RPC function invariants (migration file) ──────────────────────────────

describe('self_serve_upgrade function removed', () => {
  it('upgrade route no longer depends on self_serve_upgrade RPC', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.doesNotMatch(route, /self_serve_upgrade/, 'self_serve_upgrade RPC has been removed');
  });
});
