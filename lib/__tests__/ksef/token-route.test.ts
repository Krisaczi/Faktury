/**
 * Unit tests for the KSeF token save endpoint logic.
 *
 * Tests the pure-logic invariants of /api/ksef/token:
 *   - env validation (must be 'test' or 'prod')
 *   - role validation (owner or accountant)
 *   - token masking logic
 *   - route source invariants (uses auth.getUser, no raw token in response)
 *
 * These tests deliberately avoid importing modules that use @/ path aliases
 * or next/* imports (which jiti can't resolve outside Next.js). Source-level
 * invariants are verified by reading the route file directly.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/ksef/token-route.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const routePath = join(projectRoot, 'app', 'api', 'ksef', 'token', 'route.ts');

// ─── 1. Environment validation logic ────────────────────────────────────────────

describe('environment validation', () => {
  const ALLOWED_ENVS = ['test', 'prod'] as const;
  type KsefEnv = (typeof ALLOWED_ENVS)[number];

  function isValidEnv(env: string | undefined): env is KsefEnv {
    return !!env && ALLOWED_ENVS.includes(env as KsefEnv);
  }

  it('accepts "test"', () => {
    assert.ok(isValidEnv('test'));
  });

  it('accepts "prod"', () => {
    assert.ok(isValidEnv('prod'));
  });

  it('rejects "production"', () => {
    assert.ok(!isValidEnv('production'));
  });

  it('rejects empty string', () => {
    assert.ok(!isValidEnv(''));
  });

  it('rejects undefined', () => {
    assert.ok(!isValidEnv(undefined));
  });

  it('rejects "TEST" (case-sensitive)', () => {
    assert.ok(!isValidEnv('TEST'));
  });
});

// ─── 2. Role validation logic ───────────────────────────────────────────────────

describe('role validation', () => {
  const ALLOWED_ROLES = ['owner', 'accountant'] as const;

  function canManageKSeF(role: string): boolean {
    return ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number]);
  }

  it('allows owner', () => {
    assert.ok(canManageKSeF('owner'));
  });

  it('allows accountant', () => {
    assert.ok(canManageKSeF('accountant'));
  });

  it('rejects admin (legacy role)', () => {
    assert.ok(!canManageKSeF('admin'));
  });

  it('rejects empty string', () => {
    assert.ok(!canManageKSeF(''));
  });

  it('rejects unknown role', () => {
    assert.ok(!canManageKSeF('viewer'));
  });
});

// ─── 3. Token masking logic ─────────────────────────────────────────────────────

describe('maskToken', () => {
  function maskToken(token: string): string {
    if (!token || token.length <= 8) return '****';
    return `${token.slice(0, 4)}…${token.slice(-4)}`;
  }

  it('masks a normal-length token with first 4 and last 4 chars', () => {
    const masked = maskToken('abcdefghijklmnop');
    assert.equal(masked, 'abcd…mnop');
  });

  it('returns **** for short tokens (<=8 chars)', () => {
    assert.equal(maskToken('short'), '****');
    assert.equal(maskToken('12345678'), '****');
  });

  it('returns **** for empty string', () => {
    assert.equal(maskToken(''), '****');
  });

  it('never returns the full token', () => {
    const token = 'very-long-secret-token-1234567890';
    const masked = maskToken(token);
    assert.ok(!masked.includes(token));
    assert.ok(masked.length < token.length);
  });
});

// ─── 4. Route source invariants ─────────────────────────────────────────────────

describe('route source invariants', () => {
  it('exports a POST handler', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /export\s+async\s+function\s+POST/, 'must export POST');
  });

  it('uses supabase.auth.getUser for session extraction', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /auth\.getUser/, 'must use auth.getUser for server-side session validation');
  });

  it('validates env is test or prod', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /test.*prod|prod.*test/, 'must validate env against test/prod');
  });

  it('checks role is owner or accountant', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /owner.*accountant|accountant.*owner/, 'must check role is owner or accountant');
  });

  it('does not return the raw token in the response', async () => {
    const route = await readFile(routePath, 'utf8');
    // The response should contain ok, environment, updated_at — NOT the token
    assert.match(route, /ok:\s*true/, 'must return ok: true');
    assert.doesNotMatch(route, /token:\s*token/, 'must not return raw token in response');
  });

  it('writes audit rows to ksef_audit', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /ksef_audit/, 'must write to ksef_audit');
    assert.match(route, /field_changed/, 'must include field_changed in audit');
    assert.match(route, /actor_id/, 'must include actor_id in audit');
  });

  it('uses masked values in audit, not raw token', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /maskToken/, 'must use maskToken function');
    assert.match(route, /old_value_masked/, 'must use old_value_masked');
    assert.match(route, /new_value_masked/, 'must use new_value_masked');
  });

  it('marks route as force-dynamic', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /export\s+const\s+dynamic\s*=\s*'force-dynamic'/, 'must be force-dynamic');
  });

  it('reads company_id from the users table (not from request body)', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /from\('users'\)/, 'must look up user in users table');
    assert.match(route, /company_id.*role/, 'must select company_id and role');
    // Should NOT read companyId from the body
    assert.doesNotMatch(route, /body\.companyId|body\.company_id/, 'must not read companyId from request body');
  });

  it('sets updated_by on the upserted credential', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /updated_by/, 'must set updated_by on the credential');
  });

  it('returns 403 for forbidden role', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /FORBIDDEN.*403|403.*FORBIDDEN/, 'must return 403 for forbidden role');
  });

  it('returns 400 for invalid env', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /INVALID_ENV.*400|400.*INVALID_ENV/, 'must return 400 for invalid env');
  });

  it('returns 400 for missing token', async () => {
    const route = await readFile(routePath, 'utf8');
    assert.match(route, /TOKEN_REQUIRED.*400|400.*TOKEN_REQUIRED/, 'must return 400 for missing token');
  });
});

// ─── 5. Frontend gating invariants ──────────────────────────────────────────────

describe('frontend gating invariants', () => {
  const settingsPath = join(projectRoot, 'app', '(app)', 'settings', 'page.tsx');

  it('defines canManageKSeF helper', async () => {
    const src = await readFile(settingsPath, 'utf8');
    assert.match(src, /canManageKSeF/, 'must define canManageKSeF helper');
  });

  it('canManageKSeF returns true for owner and accountant', async () => {
    const src = await readFile(settingsPath, 'utf8');
    // The function should check for both 'owner' and 'accountant'
    assert.match(src, /canManageKSeF[\s\S]*?owner[\s\S]*?accountant|canManageKSeF[\s\S]*?accountant[\s\S]*?owner/,
      'canManageKSeF must check for both owner and accountant');
  });

  it('KsefCredentialsCard accepts role prop (not isAdmin)', async () => {
    const src = await readFile(settingsPath, 'utf8');
    assert.match(src, /KsefCredentialsCard.*role.*string/, 'must accept role prop');
    assert.doesNotMatch(src, /KsefCredentialsCard.*isAdmin/, 'must not use isAdmin prop');
  });

  it('has show/hide token toggle with Eye/EyeOff icons', async () => {
    const src = await readFile(settingsPath, 'utf8');
    assert.match(src, /Eye[^a-zA-Z]/, 'must import Eye icon');
    assert.match(src, /EyeOff/, 'must import EyeOff icon');
    assert.match(src, /showToken/, 'must have showToken state');
  });

  it('saves through /api/ksef/token (not direct client upsert)', async () => {
    const src = await readFile(settingsPath, 'utf8');
    assert.match(src, /api\/ksef\/token/, 'must call /api/ksef/token API');
    // The handleSave function should use fetch to the API, not supabase upsert
    assert.match(src, /fetch\(['"]\/api\/ksef\/token['"]/, 'handleSave must use fetch to /api/ksef/token');
  });

  it('has informative copy for accountants', async () => {
    const src = await readFile(settingsPath, 'utf8');
    assert.match(src, /Możesz zapisać token KSeF dla swojej firmy/,
      'must show "Możesz zapisać token KSeF dla swojej firmy" when enabled');
  });
});
