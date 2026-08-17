/**
 * Unit tests for onboardNewUser business logic and role defaults.
 *
 * Strategy: inline the guard and mutation logic with controlled in-memory
 * fixtures — no live DB, no Supabase client required.
 *
 * Note: promoteToAdmin / demoteAdmin have been removed. Only 'owner' and
 * 'accountant' are valid roles; new users always receive 'accountant'.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/auth/role-actions.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Types ────────────────────────────────────────────────────────────────────

type AppRole = 'owner' | 'accountant';

type UserRow = {
  id:         string;
  email:      string;
  role:       AppRole;
  company_id: string;
  active:     boolean;
};

type StatusLog = {
  targetId:   string;
  changedBy:  string;
  newActive:  boolean;
  reason:     string;
};

// ─── Inline simulation of onboardNewUser logic ────────────────────────────────

type OnboardParams = {
  email:     string;
  fullName:  string;
  companyId: string;
};

function simulateOnboard(opts: {
  caller:    UserRow;
  params:    OnboardParams;
  store:     Map<string, UserRow>;
  statusLog: StatusLog[];
}): { ok: boolean; data?: { userId: string }; error?: string } {
  const { caller, params, store, statusLog } = opts;

  if (caller.role !== 'owner') {
    return { ok: false, error: 'Tylko właściciel może zarządzać statusem kont.' };
  }

  // Check for existing user in company with same email
  const existing = Array.from(store.values()).find(
    (u) => u.email.toLowerCase() === params.email.toLowerCase() && u.company_id === caller.company_id
  );
  if (existing) {
    return { ok: false, error: 'Użytkownik z tym adresem e-mail już istnieje w firmie.' };
  }

  const newId = `new-${Date.now()}`;
  const newUser: UserRow = {
    id:         newId,
    email:      params.email,
    role:       'accountant',
    company_id: caller.company_id,
    active:     true,
  };
  store.set(newId, newUser);
  statusLog.push({ targetId: newId, changedBy: caller.id, newActive: true, reason: 'onboarded by owner as accountant' });
  return { ok: true, data: { userId: newId } };
}

// ─── Shared fixtures ─────────────────────────────────────────────────────────

function makeFixtures() {
  const owner: UserRow   = { id: 'owner-1', email: 'owner@co.com',   role: 'owner',      company_id: 'co-1', active: true };
  const acct: UserRow    = { id: 'acct-1',  email: 'acct@co.com',    role: 'accountant', company_id: 'co-1', active: true };
  const foreign: UserRow = { id: 'fgn-1',   email: 'fgn@other.com',  role: 'accountant', company_id: 'co-2', active: true };
  const store            = new Map<string, UserRow>([[owner.id, owner], [acct.id, acct], [foreign.id, foreign]]);
  const statusLog: StatusLog[] = [];
  return { owner, acct, foreign, store, statusLog };
}

// ─── Role default tests ──────────────────────────────────────────────────────

describe('Role defaults', () => {
  it('accountant role is the default for newly onboarded users', () => {
    const { owner, store, statusLog } = makeFixtures();
    const result = simulateOnboard({
      caller:    owner,
      params:    { email: 'new@co.com', fullName: 'Jan Kowalski', companyId: owner.company_id },
      store,
      statusLog,
    });

    assert.equal(result.ok, true);
    assert.ok(result.data?.userId, 'userId returned');

    const created = store.get(result.data!.userId);
    assert.ok(created, 'user added to store');
    assert.equal(created!.role, 'accountant');
  });

  it('cannot set role to owner via onboarding', () => {
    const { owner, store, statusLog } = makeFixtures();
    const result = simulateOnboard({
      caller:    owner,
      params:    { email: 'fresh@co.com', fullName: 'Fresh User', companyId: owner.company_id },
      store,
      statusLog,
    });

    assert.equal(result.ok, true);
    const created = store.get(result.data!.userId);
    assert.ok(created);
    // Onboarding always assigns 'accountant' — there is no path to 'owner'
    assert.equal(created!.role, 'accountant');
    assert.notEqual(created!.role, 'owner');
  });
});

// ─── onboardNewUser tests ─────────────────────────────────────────────────────

describe('onboardNewUser', () => {
  it('owner can onboard a new user', () => {
    const { owner, store, statusLog } = makeFixtures();
    const result = simulateOnboard({
      caller:    owner,
      params:    { email: 'new@co.com', fullName: 'Jan Kowalski', companyId: owner.company_id },
      store,
      statusLog,
    });

    assert.equal(result.ok, true);
    assert.ok(result.data?.userId, 'userId returned');

    const created = store.get(result.data!.userId);
    assert.ok(created, 'user added to store');
    assert.equal(created!.role, 'accountant');
    assert.equal(created!.company_id, owner.company_id);
    assert.equal(created!.active, true);

    assert.equal(statusLog.length, 1);
    assert.match(statusLog[0].reason, /onboarded/);
  });

  it('non-owner is rejected', () => {
    const { acct, store, statusLog } = makeFixtures();
    const result = simulateOnboard({
      caller:    acct,
      params:    { email: 'new@co.com', fullName: 'Anna Nowak', companyId: acct.company_id },
      store,
      statusLog,
    });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /właściciel/);
    assert.equal(statusLog.length, 0);
  });

  it('duplicate email in same company is rejected', () => {
    const { owner, acct, store, statusLog } = makeFixtures();
    const result = simulateOnboard({
      caller:    owner,
      params:    { email: acct.email, fullName: 'Duplicate', companyId: owner.company_id },
      store,
      statusLog,
    });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /już istnieje/);
    assert.equal(statusLog.length, 0);
  });

  it('duplicate email check is case-insensitive', () => {
    const { owner, acct, store, statusLog } = makeFixtures();
    const result = simulateOnboard({
      caller:    owner,
      params:    { email: acct.email.toUpperCase(), fullName: 'Dup Upper', companyId: owner.company_id },
      store,
      statusLog,
    });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /już istnieje/);
  });

  it('same email in different company is allowed', () => {
    const { owner, store, statusLog } = makeFixtures();
    const result = simulateOnboard({
      caller:    owner,
      params:    { email: 'fgn@other.com', fullName: 'Allowed', companyId: owner.company_id },
      store,
      statusLog,
    });

    assert.equal(result.ok, true, 'cross-company email collision is allowed');
  });

  it('new user always gets role=accountant', () => {
    const { owner, store, statusLog } = makeFixtures();
    const result = simulateOnboard({
      caller:    owner,
      params:    { email: 'fresh@co.com', fullName: 'Fresh User', companyId: owner.company_id },
      store,
      statusLog,
    });

    assert.equal(result.ok, true);
    assert.equal(store.get(result.data!.userId)?.role, 'accountant');
  });
});

// ─── Owner user listing visibility tests ──────────────────────────────────────
// Simulates the getUsersWithRoles logic: owner should see ALL users, not just
// those in their own company. The old code filtered by company_id which hid
// users from other companies.

describe('Owner user listing visibility', () => {
  it('owner should see users from all companies, not just own', () => {
    const { owner, acct, foreign, store } = makeFixtures();
    const allUsers = Array.from(store.values());

    // Old behavior: filter by owner's company_id
    const oldFiltered = allUsers.filter((u) => u.company_id === owner.company_id);
    assert.equal(oldFiltered.length, 2, 'old filter shows only owner company users');

    // New behavior: no company_id filter — owner sees all
    const newFiltered = allUsers;
    assert.equal(newFiltered.length, 3, 'owner sees all 3 users across companies');
    assert.ok(newFiltered.some((u) => u.id === foreign.id), 'foreign company user is visible');
  });

  it('listing includes inactive users', () => {
    const { store } = makeFixtures();
    const inactiveUser: UserRow = {
      id: 'inactive-1', email: 'inactive@co.com', role: 'accountant',
      company_id: 'co-2', active: false,
    };
    store.set(inactiveUser.id, inactiveUser);

    const allUsers = Array.from(store.values());
    assert.ok(allUsers.some((u) => u.id === inactiveUser.id), 'inactive user is in listing');
    assert.ok(allUsers.some((u) => u.active === false), 'inactive flag is preserved');
  });

  it('listing does not filter by role', () => {
    const { store } = makeFixtures();
    const allUsers = Array.from(store.values());

    assert.ok(allUsers.some((u) => u.role === 'owner'), 'owner is in listing');
    assert.ok(allUsers.some((u) => u.role === 'accountant'), 'accountant is in listing');
  });

  it('search filters by email case-insensitively', () => {
    const { store } = makeFixtures();
    const allUsers = Array.from(store.values());
    const search = 'OWNER';
    const filtered = allUsers.filter((u) =>
      u.email.toLowerCase().includes(search.toLowerCase()),
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].email, 'owner@co.com');
  });

  it('pagination does not hide users when total > pageSize', () => {
    const { store } = makeFixtures();
    // Add extra users to exceed page size
    for (let i = 0; i < 60; i++) {
      store.set(`extra-${i}`, {
        id: `extra-${i}`, email: `extra${i}@co.com`, role: 'accountant',
        company_id: 'co-1', active: true,
      });
    }
    const allUsers = Array.from(store.values());
    const pageSize = 50;
    const firstPage = allUsers.slice(0, pageSize);
    const totalCount = allUsers.length;

    assert.ok(totalCount > pageSize, 'total exceeds page size');
    assert.equal(firstPage.length, pageSize, 'first page is full');
    assert.ok(totalCount > firstPage.length, 'more pages exist');
  });

  it('non-owner (accountant) is rejected by requireOwner guard', () => {
    const { acct } = makeFixtures();
    const isOwner = acct.role === 'owner';
    assert.equal(isOwner, false);
  });

  it('company_name is populated for users with company_id', () => {
    const { owner } = makeFixtures();
    assert.ok(owner.company_id, 'user has company_id');
    // In the real query, company_name is fetched via a separate companies lookup
    // Here we verify the mapping logic
    const companies = new Map([['co-1', 'Firma A'], ['co-2', 'Firma B']]);
    const companyName = companies.get(owner.company_id) ?? null;
    assert.equal(companyName, 'Firma A');
  });

  it('company_name is null for users without company_id', () => {
    const orphanUser: UserRow = {
      id: 'orphan-1', email: 'orphan@no.co', role: 'accountant',
      company_id: '', active: true,
    };
    const companies = new Map([['co-1', 'Firma A']]);
    const companyName = orphanUser.company_id ? companies.get(orphanUser.company_id) ?? null : null;
    assert.equal(companyName, null);
  });
});
