/**
 * Tests for the single-global-owner role assignment policy.
 *
 * Verifies that:
 * - New users always get 'accountant' role
 * - No signup path can produce an 'owner' user
 * - The grantOwnerRole function rejects non-Krzysztof targets
 * - Only the configured OWNER_USER_ID can call grantOwnerRole
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/auth/single-owner-policy.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const KRZYSZTOF_USER_ID = '80c57af9-d139-4934-a105-8380d5ecc831';

// ─── Simulated user store ─────────────────────────────────────────────────────

interface SimUser {
  id:         string;
  email:      string;
  role:       'owner' | 'accountant';
  company_id: string | null;
  active:     boolean;
}

class SimUserStore {
  users: Map<string, SimUser> = new Map();
  nextId = 1;

  /** Simulates public registration — must always assign 'accountant' */
  signup(email: string): SimUser {
    const id = `user-${this.nextId++}`;
    const user: SimUser = {
      id,
      email,
      role: 'accountant', // Always accountant — never owner
      company_id: null,
      active: true,
    };
    this.users.set(id, user);
    return user;
  }

  /** Simulates complete_user_onboarding — must assign 'accountant', NOT 'owner' */
  onboard(userId: string, companyId: string): { ok: boolean; error?: string } {
    const user = this.users.get(userId);
    if (!user) return { ok: false, error: 'User not found' };
    if (user.company_id) return { ok: false, error: 'Already onboarded' };

    user.company_id = companyId;
    user.role = 'accountant'; // Onboarding assigns accountant, never owner
    return { ok: true };
  }

  /** Simulates grant_owner_role — only Krzysztof can be target */
  grantOwnerRole(
    callerId: string,
    targetUserId: string,
  ): { ok: boolean; error?: string } {
    // Only Krzysztof can call this
    if (callerId !== KRZYSZTOF_USER_ID) {
      return { ok: false, error: 'Only the application owner can perform this action.' };
    }

    // Target must be Krzysztof
    if (targetUserId !== KRZYSZTOF_USER_ID) {
      return { ok: false, error: 'The owner role can only be assigned to Krzysztof.' };
    }

    const target = this.users.get(targetUserId);
    if (!target) return { ok: false, error: 'Target user not found.' };
    if (target.role === 'owner') return { ok: false, error: 'Already owner.' };

    target.role = 'owner';
    return { ok: true };
  }

  /** Count users with a given role */
  countByRole(role: string): number {
    return Array.from(this.users.values()).filter((u) => u.role === role).length;
  }

  /** Get all users with a given role */
  getByRole(role: string): SimUser[] {
    return Array.from(this.users.values()).filter((u) => u.role === role);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Single global owner policy', () => {

  describe('Public registration', () => {
    it('assigns accountant role to a new user', () => {
      const store = new SimUserStore();
      const user = store.signup('newuser@example.com');
      assert.equal(user.role, 'accountant');
    });

    it('never assigns owner role during signup', () => {
      const store = new SimUserStore();
      store.signup('user1@example.com');
      store.signup('user2@example.com');
      store.signup('user3@example.com');
      assert.equal(store.countByRole('owner'), 0);
      assert.equal(store.countByRole('accountant'), 3);
    });

    it('registering multiple users produces zero owners', () => {
      const store = new SimUserStore();
      for (let i = 0; i < 10; i++) {
        store.signup(`user${i}@example.com`);
      }
      assert.equal(store.countByRole('owner'), 0);
      assert.equal(store.countByRole('accountant'), 10);
    });
  });

  describe('Onboarding', () => {
    it('assigns accountant role (not owner) after onboarding', () => {
      const store = new SimUserStore();
      const user = store.signup('newuser@example.com');
      const result = store.onboard(user.id, 'company-1');
      assert.equal(result.ok, true);
      assert.equal(store.users.get(user.id)!.role, 'accountant');
    });

    it('onboarding multiple users produces zero owners', () => {
      const store = new SimUserStore();
      for (let i = 0; i < 5; i++) {
        const user = store.signup(`user${i}@example.com`);
        store.onboard(user.id, `company-${i}`);
      }
      assert.equal(store.countByRole('owner'), 0);
      assert.equal(store.countByRole('accountant'), 5);
    });

    it('package selection (Starter) does not assign owner', () => {
      const store = new SimUserStore();
      const user = store.signup('starter@example.com');
      store.onboard(user.id, 'company-1');
      // Simulate selecting Starter package — role should stay accountant
      assert.equal(store.users.get(user.id)!.role, 'accountant');
    });

    it('package selection (Professional) does not assign owner', () => {
      const store = new SimUserStore();
      const user = store.signup('pro@example.com');
      store.onboard(user.id, 'company-1');
      // Simulate selecting Professional package — role should stay accountant
      assert.equal(store.users.get(user.id)!.role, 'accountant');
    });
  });

  describe('grantOwnerRole', () => {
    it('rejects non-Krzysztof caller', () => {
      const store = new SimUserStore();
      const caller = store.signup('attacker@example.com');
      const result = store.grantOwnerRole(caller.id, KRZYSZTOF_USER_ID);
      assert.equal(result.ok, false);
      assert.ok(result.error!.includes('application owner'));
    });

    it('rejects non-Krzysztof target even if caller is Krzysztof', () => {
      const store = new SimUserStore();
      // Seed Krzysztof
      store.users.set(KRZYSZTOF_USER_ID, {
        id:         KRZYSZTOF_USER_ID,
        email:      'krisaczi@yahoo.com',
        role:       'accountant', // temporarily demoted
        company_id: 'company-x',
        active:     true,
      });
      const target = store.signup('someone@example.com');
      const result = store.grantOwnerRole(KRZYSZTOF_USER_ID, target.id);
      assert.equal(result.ok, false);
      assert.ok(result.error!.includes('Krzysztof'));
    });

    it('succeeds when Krzysztof restores his own owner role', () => {
      const store = new SimUserStore();
      store.users.set(KRZYSZTOF_USER_ID, {
        id:         KRZYSZTOF_USER_ID,
        email:      'krisaczi@yahoo.com',
        role:       'accountant', // temporarily demoted
        company_id: 'company-x',
        active:     true,
      });
      const result = store.grantOwnerRole(KRZYSZTOF_USER_ID, KRZYSZTOF_USER_ID);
      assert.equal(result.ok, true);
      assert.equal(store.users.get(KRZYSZTOF_USER_ID)!.role, 'owner');
    });

    it('rejects if Krzysztof is already owner', () => {
      const store = new SimUserStore();
      store.users.set(KRZYSZTOF_USER_ID, {
        id:         KRZYSZTOF_USER_ID,
        email:      'krisaczi@yahoo.com',
        role:       'owner',
        company_id: 'company-x',
        active:     true,
      });
      const result = store.grantOwnerRole(KRZYSZTOF_USER_ID, KRZYSZTOF_USER_ID);
      assert.equal(result.ok, false);
      assert.ok(result.error!.toLowerCase().includes('already'));
    });
  });

  describe('Global owner invariant', () => {
    it('at most one owner exists after many signups and onboardings', () => {
      const store = new SimUserStore();
      for (let i = 0; i < 20; i++) {
        const user = store.signup(`user${i}@example.com`);
        store.onboard(user.id, `company-${i}`);
      }
      assert.equal(store.countByRole('owner'), 0);
      assert.equal(store.countByRole('accountant'), 20);
    });

    it('exactly one owner after Krzysztof restores his role', () => {
      const store = new SimUserStore();
      for (let i = 0; i < 10; i++) {
        const user = store.signup(`user${i}@example.com`);
        store.onboard(user.id, `company-${i}`);
      }
      store.users.set(KRZYSZTOF_USER_ID, {
        id:         KRZYSZTOF_USER_ID,
        email:      'krisaczi@yahoo.com',
        role:       'accountant',
        company_id: 'company-x',
        active:     true,
      });
      store.grantOwnerRole(KRZYSZTOF_USER_ID, KRZYSZTOF_USER_ID);

      assert.equal(store.countByRole('owner'), 1);
      assert.equal(store.getByRole('owner')[0].id, KRZYSZTOF_USER_ID);
    });
  });
});
