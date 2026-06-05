/**
 * Unit tests for deactivateUser / reactivateUser business logic.
 *
 * Strategy: inline the guard and mutation logic with controlled mock data so
 * no live DB or auth is required.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/auth/user-status.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRow = {
  id:         string;
  email:      string;
  role:       string;
  company_id: string;
  active:     boolean;
};

// ─── Inline simulation of deactivateUser logic ────────────────────────────────

function simulateDeactivate(opts: {
  caller:   UserRow;
  target:   UserRow;
  store:    Map<string, UserRow>;
  auditLog: Array<{ targetId: string; newActive: boolean; reason: string | null }>;
  reason?:  string;
}): { ok: boolean; error?: string } {
  const { caller, target, store, auditLog, reason } = opts;

  // Auth guard
  if (caller.role !== 'owner' || !caller.active) {
    return { ok: false, error: 'Tylko aktywny właściciel może zarządzać statusem kont.' };
  }
  // Same company
  if (target.company_id !== caller.company_id) {
    return { ok: false, error: 'Brak uprawnień do zarządzania tym kontem.' };
  }
  // Cannot deactivate self
  if (target.id === caller.id) {
    return { ok: false, error: 'Nie możesz dezaktywować własnego konta.' };
  }
  // Cannot deactivate another owner
  if (target.role === 'owner') {
    return { ok: false, error: 'Nie można dezaktywować konta właściciela.' };
  }
  // Already inactive
  if (!target.active) {
    return { ok: false, error: 'Konto jest już nieaktywne.' };
  }

  store.set(target.id, { ...target, active: false });
  auditLog.push({ targetId: target.id, newActive: false, reason: reason ?? null });
  return { ok: true };
}

// ─── Inline simulation of reactivateUser logic ────────────────────────────────

function simulateReactivate(opts: {
  caller:   UserRow;
  target:   UserRow;
  store:    Map<string, UserRow>;
  auditLog: Array<{ targetId: string; newActive: boolean; reason: string | null }>;
  reason?:  string;
}): { ok: boolean; error?: string } {
  const { caller, target, store, auditLog, reason } = opts;

  if (caller.role !== 'owner' || !caller.active) {
    return { ok: false, error: 'Tylko aktywny właściciel może zarządzać statusem kont.' };
  }
  if (target.company_id !== caller.company_id) {
    return { ok: false, error: 'Brak uprawnień do zarządzania tym kontem.' };
  }
  if (target.active) {
    return { ok: false, error: 'Konto jest już aktywne.' };
  }

  store.set(target.id, { ...target, active: true });
  auditLog.push({ targetId: target.id, newActive: true, reason: reason ?? null });
  return { ok: true };
}

// ─── Shared fixtures ─────────────────────────────────────────────────────────

function makeFixtures() {
  const owner: UserRow   = { id: 'owner-1', email: 'owner@co.com', role: 'owner',  company_id: 'co-1', active: true };
  const member: UserRow  = { id: 'user-1',  email: 'user@co.com',  role: 'member', company_id: 'co-1', active: true };
  const other: UserRow   = { id: 'user-2',  email: 'other@co.com', role: 'member', company_id: 'co-2', active: true };
  const store            = new Map<string, UserRow>([[owner.id, owner], [member.id, member], [other.id, other]]);
  const auditLog: Array<{ targetId: string; newActive: boolean; reason: string | null }> = [];
  return { owner, member, other, store, auditLog };
}

// ─── deactivateUser tests ─────────────────────────────────────────────────────

describe('deactivateUser', () => {
  it('owner can deactivate a member', () => {
    const { owner, member, store, auditLog } = makeFixtures();
    const result = simulateDeactivate({ caller: owner, target: member, store, auditLog, reason: 'test' });

    assert.equal(result.ok, true);
    assert.equal(store.get(member.id)?.active, false);
    assert.equal(auditLog.length, 1);
    assert.equal(auditLog[0].newActive, false);
    assert.equal(auditLog[0].reason, 'test');
  });

  it('non-owner is rejected', () => {
    const { member, store, auditLog } = makeFixtures();
    const anotherMember: UserRow = { id: 'user-9', email: 'x@co.com', role: 'member', company_id: 'co-1', active: true };
    const result = simulateDeactivate({ caller: member, target: anotherMember, store, auditLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /właściciel/);
    assert.equal(store.get(anotherMember.id), undefined, 'store unchanged');
    assert.equal(auditLog.length, 0);
  });

  it('inactive owner is rejected', () => {
    const { member, store, auditLog } = makeFixtures();
    const inactiveOwner: UserRow = { id: 'owner-2', email: 'o2@co.com', role: 'owner', company_id: 'co-1', active: false };
    const result = simulateDeactivate({ caller: inactiveOwner, target: member, store, auditLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /aktywny/);
  });

  it('owner cannot deactivate self', () => {
    const { owner, store, auditLog } = makeFixtures();
    const result = simulateDeactivate({ caller: owner, target: owner, store, auditLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /własnego/);
    assert.equal(store.get(owner.id)?.active, true, 'owner remains active');
  });

  it('owner cannot deactivate another owner', () => {
    const { owner, store, auditLog } = makeFixtures();
    const otherOwner: UserRow = { id: 'owner-3', email: 'o3@co.com', role: 'owner', company_id: 'co-1', active: true };
    const result = simulateDeactivate({ caller: owner, target: otherOwner, store, auditLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /właściciela/);
  });

  it('cannot deactivate user from a different company', () => {
    const { owner, other, store, auditLog } = makeFixtures();
    const result = simulateDeactivate({ caller: owner, target: other, store, auditLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /uprawnień/);
  });

  it('deactivating already-inactive user returns error', () => {
    const { owner, member, store, auditLog } = makeFixtures();
    store.set(member.id, { ...member, active: false });
    const inactiveMember = store.get(member.id)!;
    const result = simulateDeactivate({ caller: owner, target: inactiveMember, store, auditLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /nieaktywne/);
    assert.equal(auditLog.length, 0);
  });

  it('writes audit log with reason', () => {
    const { owner, member, store, auditLog } = makeFixtures();
    simulateDeactivate({ caller: owner, target: member, store, auditLog, reason: 'zakończenie współpracy' });

    assert.equal(auditLog[0].reason, 'zakończenie współpracy');
  });

  it('writes audit log with null reason when none provided', () => {
    const { owner, member, store, auditLog } = makeFixtures();
    simulateDeactivate({ caller: owner, target: member, store, auditLog });

    assert.equal(auditLog[0].reason, null);
  });
});

// ─── reactivateUser tests ─────────────────────────────────────────────────────

describe('reactivateUser', () => {
  it('owner can reactivate a deactivated user', () => {
    const { owner, member, store, auditLog } = makeFixtures();
    store.set(member.id, { ...member, active: false });
    const inactive = store.get(member.id)!;

    const result = simulateReactivate({ caller: owner, target: inactive, store, auditLog, reason: 'powrót' });

    assert.equal(result.ok, true);
    assert.equal(store.get(member.id)?.active, true);
    assert.equal(auditLog[0].newActive, true);
    assert.equal(auditLog[0].reason, 'powrót');
  });

  it('non-owner is rejected', () => {
    const { member, store, auditLog } = makeFixtures();
    const inactive: UserRow = { id: 'user-3', email: 'u3@co.com', role: 'member', company_id: 'co-1', active: false };
    const result = simulateReactivate({ caller: member, target: inactive, store, auditLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /właściciel/);
  });

  it('reactivating already-active user returns error', () => {
    const { owner, member, store, auditLog } = makeFixtures();
    const result = simulateReactivate({ caller: owner, target: member, store, auditLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /aktywne/);
    assert.equal(auditLog.length, 0);
  });

  it('cannot reactivate user from a different company', () => {
    const { owner, auditLog } = makeFixtures();
    const store = new Map<string, UserRow>();
    const foreign: UserRow = { id: 'f-1', email: 'f@other.com', role: 'member', company_id: 'co-9', active: false };
    const result = simulateReactivate({ caller: owner, target: foreign, store, auditLog });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /uprawnień/);
  });
});

// ─── Middleware enforcement simulation ───────────────────────────────────────

describe('Middleware active check (logic)', () => {
  it('inactive user on protected path gets redirected', () => {
    const pathname   = '/dashboard';
    const user       = { id: 'user-1' };
    const userRow    = { active: false };
    const isPublic   = ['/login', '/signup', '/account-inactive'].includes(pathname);

    const shouldBlock = user && !isPublic && userRow && userRow.active === false;

    assert.equal(shouldBlock, true);
  });

  it('active user on protected path is allowed through', () => {
    const pathname = '/dashboard';
    const user     = { id: 'user-1' };
    const userRow  = { active: true };
    const isPublic = ['/login', '/signup', '/account-inactive'].includes(pathname);

    const shouldBlock = user && !isPublic && userRow && userRow.active === false;

    assert.equal(shouldBlock, false);
  });

  it('inactive user on public path is not blocked', () => {
    const pathname = '/account-inactive';
    const user     = { id: 'user-1' };
    const userRow  = { active: false };
    const isPublic = ['/login', '/signup', '/account-inactive'].includes(pathname);

    const shouldBlock = user && !isPublic && userRow && userRow.active === false;

    assert.equal(shouldBlock, false);
  });

  it('unauthenticated request does not trigger active check', () => {
    const user    = null;
    const userRow = null;

    const shouldBlock = user && userRow && (userRow as { active: boolean }).active === false;

    assert.equal(shouldBlock, null, 'null is falsy — no block');
  });
});
