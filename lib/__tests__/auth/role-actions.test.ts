/**
 * Unit tests for promoteToAdmin / demoteAdmin / onboardNewUser business logic.
 *
 * Strategy: inline the guard and mutation logic with controlled in-memory
 * fixtures — no live DB, no Supabase client required.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/auth/role-actions.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Types ────────────────────────────────────────────────────────────────────

type AppRole = 'owner' | 'admin' | 'accountant';

type UserRow = {
  id:         string;
  email:      string;
  role:       AppRole;
  company_id: string;
  active:     boolean;
};

type RoleLog = {
  targetId:     string;
  changedBy:    string;
  previousRole: AppRole;
  newRole:      AppRole;
  reason:       string | null;
};

// ─── Inline simulation of promoteToAdmin logic ────────────────────────────────

function simulatePromote(opts: {
  caller:   UserRow;
  target:   UserRow;
  store:    Map<string, UserRow>;
  roleLog:  RoleLog[];
  reason?:  string;
}): { ok: boolean; error?: string } {
  const { caller, target, store, roleLog, reason } = opts;

  if (caller.role !== 'owner') {
    return { ok: false, error: 'Tylko właściciel może zarządzać rolami.' };
  }
  if (target.company_id !== caller.company_id) {
    return { ok: false, error: 'Brak uprawnień.' };
  }
  if (target.id === caller.id) {
    return { ok: false, error: 'Nie możesz zmienić własnej roli.' };
  }
  if (target.role === 'owner') {
    return { ok: false, error: 'Nie można zmienić roli właściciela.' };
  }
  if (target.role === 'admin') {
    return { ok: false, error: 'Użytkownik jest już administratorem.' };
  }
  if (!target.active) {
    return { ok: false, error: 'Nie można zmienić roli nieaktywnego użytkownika.' };
  }

  const prev = target.role;
  store.set(target.id, { ...target, role: 'admin' });
  roleLog.push({ targetId: target.id, changedBy: caller.id, previousRole: prev, newRole: 'admin', reason: reason ?? null });
  return { ok: true };
}

// ─── Inline simulation of demoteAdmin logic ───────────────────────────────────

function simulateDemote(opts: {
  caller:   UserRow;
  target:   UserRow;
  store:    Map<string, UserRow>;
  roleLog:  RoleLog[];
  reason?:  string;
}): { ok: boolean; error?: string } {
  const { caller, target, store, roleLog, reason } = opts;

  if (caller.role !== 'owner') {
    return { ok: false, error: 'Tylko właściciel może zarządzać rolami.' };
  }
  if (target.company_id !== caller.company_id) {
    return { ok: false, error: 'Brak uprawnień.' };
  }
  if (target.id === caller.id) {
    return { ok: false, error: 'Nie możesz zmienić własnej roli.' };
  }
  if (target.role === 'owner') {
    return { ok: false, error: 'Nie można zmienić roli właściciela.' };
  }
  if (target.role !== 'admin') {
    return { ok: false, error: 'Użytkownik nie jest administratorem.' };
  }

  const prev = target.role;
  store.set(target.id, { ...target, role: 'accountant' });
  roleLog.push({ targetId: target.id, changedBy: caller.id, previousRole: prev, newRole: 'accountant', reason: reason ?? null });
  return { ok: true };
}

// ─── Inline simulation of onboardNewUser logic ────────────────────────────────

type OnboardParams = {
  email:     string;
  fullName:  string;
  companyId: string;
};

function simulateOnboard(opts: {
  caller:   UserRow;
  params:   OnboardParams;
  store:    Map<string, UserRow>;
  statusLog: Array<{ targetId: string; changedBy: string; newActive: boolean; reason: string }>;
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
  const owner: UserRow     = { id: 'owner-1', email: 'owner@co.com',   role: 'owner',     company_id: 'co-1', active: true };
  const admin: UserRow     = { id: 'admin-1', email: 'admin@co.com',   role: 'admin',     company_id: 'co-1', active: true };
  const acct: UserRow      = { id: 'acct-1',  email: 'acct@co.com',    role: 'accountant', company_id: 'co-1', active: true };
  const foreign: UserRow   = { id: 'fgn-1',   email: 'fgn@other.com',  role: 'accountant', company_id: 'co-2', active: true };
  const store              = new Map<string, UserRow>([[owner.id, owner], [admin.id, admin], [acct.id, acct], [foreign.id, foreign]]);
  const roleLog:   RoleLog[]  = [];
  const statusLog: Array<{ targetId: string; changedBy: string; newActive: boolean; reason: string }> = [];
  return { owner, admin, acct, foreign, store, roleLog, statusLog };
}

// ─── promoteToAdmin tests ─────────────────────────────────────────────────────

describe('promoteToAdmin', () => {
  it('owner can promote an accountant to admin', () => {
    const { owner, acct, store, roleLog } = makeFixtures();
    const result = simulatePromote({ caller: owner, target: acct, store, roleLog });

    assert.equal(result.ok, true);
    assert.equal(store.get(acct.id)?.role, 'admin');
    assert.equal(roleLog.length, 1);
    assert.equal(roleLog[0].newRole, 'admin');
    assert.equal(roleLog[0].previousRole, 'accountant');
    assert.equal(roleLog[0].changedBy, owner.id);
  });

  it('non-owner is rejected', () => {
    const { admin, acct, store, roleLog } = makeFixtures();
    const result = simulatePromote({ caller: admin, target: acct, store, roleLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /właściciel/);
    assert.equal(store.get(acct.id)?.role, 'accountant', 'role unchanged');
    assert.equal(roleLog.length, 0);
  });

  it('cannot promote user from different company', () => {
    const { owner, foreign, store, roleLog } = makeFixtures();
    const result = simulatePromote({ caller: owner, target: foreign, store, roleLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /uprawnień/);
  });

  it('owner cannot change own role', () => {
    const { owner, store, roleLog } = makeFixtures();
    const result = simulatePromote({ caller: owner, target: owner, store, roleLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /własnej/);
  });

  it('cannot promote another owner', () => {
    const { owner, store, roleLog } = makeFixtures();
    const owner2: UserRow = { id: 'owner-2', email: 'o2@co.com', role: 'owner', company_id: 'co-1', active: true };
    store.set(owner2.id, owner2);
    const result = simulatePromote({ caller: owner, target: owner2, store, roleLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /właściciela/);
  });

  it('cannot promote an already-admin user', () => {
    const { owner, admin, store, roleLog } = makeFixtures();
    const result = simulatePromote({ caller: owner, target: admin, store, roleLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /już administratorem/);
  });

  it('cannot promote inactive user', () => {
    const { owner, store, roleLog } = makeFixtures();
    const inactiveAcct: UserRow = { id: 'ia-1', email: 'ia@co.com', role: 'accountant', company_id: 'co-1', active: false };
    store.set(inactiveAcct.id, inactiveAcct);
    const result = simulatePromote({ caller: owner, target: inactiveAcct, store, roleLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /nieaktywnego/);
  });

  it('writes audit log with reason', () => {
    const { owner, acct, store, roleLog } = makeFixtures();
    simulatePromote({ caller: owner, target: acct, store, roleLog, reason: 'zastępstwo' });

    assert.equal(roleLog[0].reason, 'zastępstwo');
  });

  it('writes audit log with null reason when none provided', () => {
    const { owner, acct, store, roleLog } = makeFixtures();
    simulatePromote({ caller: owner, target: acct, store, roleLog });

    assert.equal(roleLog[0].reason, null);
  });
});

// ─── demoteAdmin tests ────────────────────────────────────────────────────────

describe('demoteAdmin', () => {
  it('owner can demote an admin to accountant', () => {
    const { owner, admin, store, roleLog } = makeFixtures();
    const result = simulateDemote({ caller: owner, target: admin, store, roleLog });

    assert.equal(result.ok, true);
    assert.equal(store.get(admin.id)?.role, 'accountant');
    assert.equal(roleLog[0].newRole, 'accountant');
    assert.equal(roleLog[0].previousRole, 'admin');
  });

  it('non-owner is rejected', () => {
    const { admin, store, roleLog } = makeFixtures();
    const admin2: UserRow = { id: 'adm-2', email: 'adm2@co.com', role: 'admin', company_id: 'co-1', active: true };
    store.set(admin2.id, admin2);
    const result = simulateDemote({ caller: admin, target: admin2, store, roleLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /właściciel/);
    assert.equal(store.get(admin2.id)?.role, 'admin', 'role unchanged');
  });

  it('cannot demote an accountant (not admin)', () => {
    const { owner, acct, store, roleLog } = makeFixtures();
    const result = simulateDemote({ caller: owner, target: acct, store, roleLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /nie jest administratorem/);
  });

  it('cannot demote owner', () => {
    const { owner, store, roleLog } = makeFixtures();
    const result = simulateDemote({ caller: owner, target: owner, store, roleLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /własnej/);
  });

  it('cannot demote user from different company', () => {
    const { owner, store, roleLog } = makeFixtures();
    const foreignAdmin: UserRow = { id: 'fa-1', email: 'fa@other.com', role: 'admin', company_id: 'co-2', active: true };
    store.set(foreignAdmin.id, foreignAdmin);
    const result = simulateDemote({ caller: owner, target: foreignAdmin, store, roleLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /uprawnień/);
  });

  it('demotion is reversible via promote', () => {
    const { owner, admin, store, roleLog } = makeFixtures();
    simulateDemote({ caller: owner, target: admin, store, roleLog });
    assert.equal(store.get(admin.id)?.role, 'accountant');

    const demotedUser = store.get(admin.id)!;
    simulatePromote({ caller: owner, target: demotedUser, store, roleLog });
    assert.equal(store.get(admin.id)?.role, 'admin');
    assert.equal(roleLog.length, 2);
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
    const { admin, store, statusLog } = makeFixtures();
    const result = simulateOnboard({
      caller:    admin,
      params:    { email: 'new@co.com', fullName: 'Anna Nowak', companyId: admin.company_id },
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
    // foreign has same email as nothing in co-1
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
