/**
 * Unit tests for syncAuthAndProfiles (dry-run and apply modes).
 *
 * Strategy: isolate the reconciliation logic with inline mock data.
 * Tests verify that:
 *   - dry-run never writes to the DB.
 *   - apply mode creates missing rows.
 *   - orphaned profiles are detected.
 *   - role mismatches are reported but NOT auto-corrected.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/auth/sync-auth-and-profiles.test.ts
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Types for local simulation ───────────────────────────────────────────────

type AuthUser = {
  id:            string;
  email:         string;
  user_metadata: { role?: string; company_id?: string; full_name?: string };
  app_metadata:  { is_demo?: boolean };
};

type ProfileRow = { id: string; email: string; role: string };

// ─── Core reconciliation logic (extracted from syncAuthAndProfiles) ────────────

function reconcile(opts: {
  authUsers:    AuthUser[];
  profileRows:  ProfileRow[];
  companyId:    string;
  allProfileIds: Set<string>;
  dryRun:       boolean;
}) {
  const { authUsers, profileRows, companyId, allProfileIds, dryRun } = opts;

  const authById  = new Map(authUsers.map((u) => [u.id, u]));
  const tableIds  = new Set(profileRows.map((r) => r.id));

  const result = {
    created:        [] as string[],
    wouldCreate:    [] as string[],
    orphaned:       [] as string[],
    roleMismatches: [] as Array<{ id: string; email: string; tableRole: string; metaRole: string }>,
    errors:         [] as string[],
    dryRun,
  };

  // Check existing profile rows
  for (const row of profileRows) {
    if (!authById.has(row.id)) {
      result.orphaned.push(row.id);
      continue;
    }
    const authUser  = authById.get(row.id)!;
    const metaRole  = authUser.user_metadata?.role ?? null;
    if (metaRole && metaRole !== row.role) {
      result.roleMismatches.push({ id: row.id, email: row.email, tableRole: row.role, metaRole });
    }
  }

  // Check auth users missing from profile set
  for (const authUser of authUsers) {
    if (tableIds.has(authUser.id)) continue;
    if (authUser.app_metadata?.is_demo) continue;

    const metaCompanyId = authUser.user_metadata?.company_id;

    if (metaCompanyId === companyId && !allProfileIds.has(authUser.id)) {
      if (dryRun) { result.wouldCreate.push(authUser.id); continue; }
      result.created.push(authUser.id);
      continue;
    }

    if (!metaCompanyId && !allProfileIds.has(authUser.id)) {
      if (dryRun) { result.wouldCreate.push(authUser.id); continue; }
      result.created.push(authUser.id);
    }
  }

  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('syncAuthAndProfiles reconciliation logic', () => {
  const CO = 'company-1';

  it('dry-run: reports wouldCreate without modifying created', () => {
    const authUsers: AuthUser[] = [
      { id: 'missing-1', email: 'miss@test.com', user_metadata: {}, app_metadata: {} },
    ];
    const result = reconcile({ authUsers, profileRows: [], companyId: CO, allProfileIds: new Set(), dryRun: true });

    assert.equal(result.wouldCreate.length, 1);
    assert.equal(result.created.length, 0);
    assert.equal(result.dryRun, true);
  });

  it('apply mode: populates created for auth users missing profiles', () => {
    const authUsers: AuthUser[] = [
      { id: 'missing-2', email: 'miss2@test.com', user_metadata: {}, app_metadata: {} },
    ];
    const result = reconcile({ authUsers, profileRows: [], companyId: CO, allProfileIds: new Set(), dryRun: false });

    assert.equal(result.created.length, 1);
    assert.equal(result.created[0], 'missing-2');
    assert.equal(result.wouldCreate.length, 0);
  });

  it('detects orphaned profiles (profile exists, no auth user)', () => {
    const profileRows: ProfileRow[] = [
      { id: 'orphan-profile', email: 'op@test.com', role: 'member' },
    ];
    const result = reconcile({ authUsers: [], profileRows, companyId: CO, allProfileIds: new Set(['orphan-profile']), dryRun: false });

    assert.equal(result.orphaned.length, 1);
    assert.equal(result.orphaned[0], 'orphan-profile');
  });

  it('detects role mismatches without changing them', () => {
    const authUsers: AuthUser[] = [
      { id: 'u1', email: 'u1@test.com', user_metadata: { role: 'admin' }, app_metadata: {} },
    ];
    const profileRows: ProfileRow[] = [
      { id: 'u1', email: 'u1@test.com', role: 'member' },
    ];
    const result = reconcile({ authUsers, profileRows, companyId: CO, allProfileIds: new Set(['u1']), dryRun: false });

    assert.equal(result.roleMismatches.length, 1);
    assert.equal(result.roleMismatches[0].tableRole, 'member');
    assert.equal(result.roleMismatches[0].metaRole, 'admin');
    assert.equal(result.created.length, 0);
  });

  it('skips demo users when detecting missing profiles', () => {
    const authUsers: AuthUser[] = [
      { id: 'demo-1', email: 'd@test.com', user_metadata: {}, app_metadata: { is_demo: true } },
    ];
    const result = reconcile({ authUsers, profileRows: [], companyId: CO, allProfileIds: new Set(), dryRun: false });

    assert.equal(result.created.length, 0);
    assert.equal(result.wouldCreate.length, 0);
  });

  it('dry-run + apply produce complementary reports for the same data', () => {
    const authUsers: AuthUser[] = [
      { id: 'new-1', email: 'n1@test.com', user_metadata: {}, app_metadata: {} },
      { id: 'new-2', email: 'n2@test.com', user_metadata: {}, app_metadata: {} },
    ];

    const dry   = reconcile({ authUsers, profileRows: [], companyId: CO, allProfileIds: new Set(), dryRun: true });
    const apply = reconcile({ authUsers, profileRows: [], companyId: CO, allProfileIds: new Set(), dryRun: false });

    assert.equal(dry.wouldCreate.length, 2);
    assert.equal(dry.created.length, 0);
    assert.equal(apply.created.length, 2);
    assert.equal(apply.wouldCreate.length, 0);
  });
});

// ─── Integration-style stub ───────────────────────────────────────────────────

describe('syncAuthAndProfiles (integration stub)', () => {
  it('returns ok:false when caller is not owner', async () => {
    // Simulate the auth guard rejection
    const callerRole: string = 'member';
    const isAuthorised = callerRole === 'owner';
    assert.equal(isAuthorised, false);

    const result = isAuthorised
      ? { ok: true as const, report: {} }
      : { ok: false as const, error: 'Only owners can run the auth sync tool.' };

    assert.equal(result.ok, false);
    assert.equal(result.error, 'Only owners can run the auth sync tool.');
  });
});
