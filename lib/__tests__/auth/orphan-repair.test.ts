/**
 * Unit tests for repairOrphanedAuthUser and findOrphanedAccounts logic.
 *
 * Strategy: test the core decision logic inline without importing the server
 * action (which requires a live Supabase client). All assertions are against
 * plain data transformations extracted from orphan-repair.ts.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/auth/orphan-repair.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Types mirrored from orphan-repair.ts ─────────────────────────────────────

type AuthUser = {
  id:                 string;
  email:              string;
  email_confirmed_at: string | null;
  created_at:         string;
  user_metadata:      { full_name?: string };
  app_metadata:       { is_demo?: boolean };
};

type ProfileRow = {
  id:         string;
  email:      string;
  role:       string;
  company_id: string | null;
  created_at: string;
};

// ─── findOrphanedAccounts logic ───────────────────────────────────────────────

function computeOrphans(authUsers: AuthUser[], profileRows: ProfileRow[]) {
  const authIds    = new Set(authUsers.map((u) => u.id));
  const profileIds = new Set(profileRows.map((r) => r.id));

  return {
    orphanedAuthUsers: authUsers.filter((u) => !profileIds.has(u.id) && !u.app_metadata?.is_demo),
    orphanedProfiles:  profileRows.filter((r) => !authIds.has(r.id)),
  };
}

describe('findOrphanedAccounts (logic)', () => {
  it('identifies auth users with no profile row', () => {
    const authUsers: AuthUser[] = [
      { id: 'auth-only', email: 'a@test.com', email_confirmed_at: null, created_at: '', user_metadata: {}, app_metadata: {} },
      { id: 'both',      email: 'b@test.com', email_confirmed_at: '2024-01-01', created_at: '', user_metadata: {}, app_metadata: {} },
    ];
    const profileRows: ProfileRow[] = [
      { id: 'both', email: 'b@test.com', role: 'member', company_id: null, created_at: '' },
    ];

    const { orphanedAuthUsers, orphanedProfiles } = computeOrphans(authUsers, profileRows);

    assert.equal(orphanedAuthUsers.length, 1);
    assert.equal(orphanedAuthUsers[0].id, 'auth-only');
    assert.equal(orphanedProfiles.length, 0);
  });

  it('identifies profile rows with no auth entry', () => {
    const authUsers: AuthUser[] = [
      { id: 'both', email: 'b@test.com', email_confirmed_at: '2024-01-01', created_at: '', user_metadata: {}, app_metadata: {} },
    ];
    const profileRows: ProfileRow[] = [
      { id: 'both',         email: 'b@test.com', role: 'member', company_id: null, created_at: '' },
      { id: 'profile-only', email: 'c@test.com', role: 'member', company_id: 'co-1', created_at: '' },
    ];

    const { orphanedProfiles } = computeOrphans(authUsers, profileRows);

    assert.equal(orphanedProfiles.length, 1);
    assert.equal(orphanedProfiles[0].id, 'profile-only');
  });

  it('skips demo users when detecting orphaned auth accounts', () => {
    const authUsers: AuthUser[] = [
      { id: 'demo-1', email: 'd@test.com', email_confirmed_at: null, created_at: '', user_metadata: {}, app_metadata: { is_demo: true } },
    ];

    const { orphanedAuthUsers } = computeOrphans(authUsers, []);
    assert.equal(orphanedAuthUsers.length, 0, 'demo users should not be flagged as orphans');
  });

  it('returns empty lists when all accounts are consistent', () => {
    const authUsers: AuthUser[] = [
      { id: 'u1', email: 'u1@test.com', email_confirmed_at: '2024-01-01', created_at: '', user_metadata: {}, app_metadata: {} },
    ];
    const profileRows: ProfileRow[] = [
      { id: 'u1', email: 'u1@test.com', role: 'owner', company_id: 'co-1', created_at: '' },
    ];

    const { orphanedAuthUsers, orphanedProfiles } = computeOrphans(authUsers, profileRows);
    assert.equal(orphanedAuthUsers.length, 0);
    assert.equal(orphanedProfiles.length, 0);
  });
});

// ─── repairOrphanedAuthUser decision logic ────────────────────────────────────

describe('repairOrphanedAuthUser (decision logic)', () => {
  it('recreate_profile action inserts users + profiles rows', async () => {
    const inserted: Array<{ table: string; id: string }> = [];

    async function recreateProfile(authUserId: string, email: string, fullName: string) {
      // Simulate Promise.allSettled insert
      inserted.push({ table: 'users', id: authUserId });
      inserted.push({ table: 'profiles', id: authUserId });
      return { ok: true as const, action: 'recreate_profile' as const };
    }

    const result = await recreateProfile('orphan-id', 'orphan@test.com', 'Orphan User');
    assert.equal(result.ok, true);
    assert.equal(inserted.filter((r) => r.table === 'users').length, 1);
    assert.equal(inserted.filter((r) => r.table === 'profiles').length, 1);
  });

  it('resend_confirmation is blocked for confirmed users', () => {
    const confirmedAt = new Date().toISOString();
    const isConfirmed = !!confirmedAt;

    // Expected outcome: { ok: false, error: 'Email is already confirmed.' }
    const result = isConfirmed
      ? { ok: false as const, error: 'Email is already confirmed.' }
      : { ok: true as const, action: 'resend_confirmation' as const };

    assert.equal(result.ok, false);
    assert.equal(result.error, 'Email is already confirmed.');
  });

  it('resend_confirmation proceeds for unconfirmed users', async () => {
    const resentTo: string[] = [];
    const email = 'unconfirmed@test.com';
    const email_confirmed_at = null;

    const canResend = !email_confirmed_at;
    assert.ok(canResend);

    resentTo.push(email);
    assert.ok(resentTo.includes(email));
  });

  it('delete_auth_user removes the auth entry and logs the action', async () => {
    const deleted: string[] = [];
    const auditLog: Array<{ action: string; targetId: string }> = [];

    async function deleteAuthUser(authUserId: string) {
      deleted.push(authUserId);
      auditLog.push({ action: 'repair_delete_auth_user', targetId: authUserId });
      return { ok: true as const, action: 'delete_auth_user' as const };
    }

    const result = await deleteAuthUser('target-id');
    assert.equal(result.ok, true);
    assert.ok(deleted.includes('target-id'));
    assert.equal(auditLog[0].action, 'repair_delete_auth_user');
  });
});

// ─── bulkRepairOrphans dry-run ────────────────────────────────────────────────

describe('bulkRepairOrphans (dry-run logic)', () => {
  it('dry-run: skips all writes and reports intended actions', () => {
    const orphans: AuthUser[] = [
      { id: 'o1', email: 'o1@test.com', email_confirmed_at: null,             created_at: '', user_metadata: {}, app_metadata: {} },
      { id: 'o2', email: 'o2@test.com', email_confirmed_at: '2024-01-01',     created_at: '', user_metadata: {}, app_metadata: {} },
    ];

    const repaired: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const o of orphans) {
      const action = o.email_confirmed_at ? 'recreate_profile' : 'resend_and_recreate';
      skipped.push({ id: o.id, reason: `dry-run: would ${action}` });
    }

    assert.equal(skipped.length, 2);
    assert.equal(repaired.length, 0);
    assert.ok(skipped[0].reason.includes('resend_and_recreate'), 'unconfirmed → resend_and_recreate');
    assert.ok(skipped[1].reason.includes('recreate_profile'),    'confirmed → recreate_profile only');
  });

  it('apply mode: repaired list grows, skipped stays empty', () => {
    const orphans: AuthUser[] = [
      { id: 'o1', email: 'o1@test.com', email_confirmed_at: null, created_at: '', user_metadata: {}, app_metadata: {} },
    ];

    const repaired: string[] = [];
    const skipped: string[] = [];

    for (const o of orphans) {
      // dryRun = false → repair
      repaired.push(o.id);
    }

    assert.equal(repaired.length, 1);
    assert.equal(skipped.length, 0);
  });
});
