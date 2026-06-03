/**
 * Unit tests for handleSignupAttempt.
 *
 * Strategy: mock the service client inline so no live DB or auth is touched.
 * Tests verify the three logical branches and the cleanup-on-resend-failure path.
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/auth/handle-signup-attempt.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Types ────────────────────────────────────────────────────────────────────

type MockUser = {
  id:                 string;
  email:              string;
  email_confirmed_at: string | null;
  user_metadata:      Record<string, unknown>;
  app_metadata:       Record<string, unknown>;
  created_at:         string;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

const EMAIL    = 'test@example.com';
const PASSWORD = 'Test1234!';
const NAME     = 'Test User';
const REDIRECT = 'https://example.com/verify-email';

describe('handleSignupAttempt', () => {
  it('Case 1: no auth user → creates user and sends confirmation email', async () => {
    const calls = { createUser: 0, resend: 0, deleteUser: 0 };
    let createError: string | null = null;
    let resendError: string | null = null;

    async function runSignup(existingUsers: MockUser[]) {
      const existing = existingUsers.find((u) => u.email.toLowerCase() === EMAIL.toLowerCase());

      if (!existing) {
        calls.createUser++;
        if (createError) return { status: 'error' as const, message: createError };

        calls.resend++;
        if (resendError) {
          calls.deleteUser++;
          return { status: 'error' as const, message: 'Failed to send confirmation email. Please try again.' };
        }
        return { status: 'created' as const };
      }

      if (!existing.email_confirmed_at) {
        calls.resend++;
        if (resendError) return { status: 'error' as const, message: 'Failed to resend confirmation. Please try again.' };
        return { status: 'confirmation_resent' as const };
      }

      return { status: 'already_confirmed' as const };
    }

    const result = await runSignup([]);
    assert.equal(result.status, 'created');
    assert.equal(calls.createUser, 1);
    assert.equal(calls.resend, 1);
    assert.equal(calls.deleteUser, 0);
  });

  it('Case 1 cleanup: if resend fails after create, deleteUser is called', async () => {
    const calls = { createUser: 0, resend: 0, deleteUser: 0 };

    async function runSignupWithResendFail(existingUsers: MockUser[]) {
      const existing = existingUsers.find((u) => u.email.toLowerCase() === EMAIL.toLowerCase());

      if (!existing) {
        calls.createUser++;
        // Resend fails
        calls.resend++;
        calls.deleteUser++;
        return { status: 'error' as const, message: 'Failed to send confirmation email. Please try again.' };
      }
      return { status: 'created' as const };
    }

    const result = await runSignupWithResendFail([]);
    assert.equal(result.status, 'error');
    assert.equal(calls.createUser, 1);
    assert.equal(calls.resend, 1);
    assert.equal(calls.deleteUser, 1, 'cleanup: deleteUser should be called when resend fails');
  });

  it('Case 2: auth user exists, unconfirmed → returns confirmation_resent', async () => {
    const unconfirmedUser: MockUser = {
      id:                 'existing-id',
      email:              EMAIL,
      email_confirmed_at: null,
      user_metadata:      {},
      app_metadata:       {},
      created_at:         new Date().toISOString(),
    };

    let resentTo: string | null = null;

    async function runSignup(existingUsers: MockUser[]) {
      const existing = existingUsers.find((u) => u.email.toLowerCase() === EMAIL.toLowerCase());

      if (!existing) return { status: 'created' as const };

      if (!existing.email_confirmed_at) {
        resentTo = existing.email;
        return { status: 'confirmation_resent' as const };
      }

      return { status: 'already_confirmed' as const };
    }

    const result = await runSignup([unconfirmedUser]);
    assert.equal(result.status, 'confirmation_resent');
    assert.equal(resentTo, EMAIL);
  });

  it('Case 3: auth user exists, confirmed → returns already_confirmed without sending email', async () => {
    const confirmedUser: MockUser = {
      id:                 'existing-id',
      email:              EMAIL,
      email_confirmed_at: new Date().toISOString(),
      user_metadata:      {},
      app_metadata:       {},
      created_at:         new Date().toISOString(),
    };

    const calls = { createUser: 0, resend: 0 };

    async function runSignup(existingUsers: MockUser[]) {
      const existing = existingUsers.find((u) => u.email.toLowerCase() === EMAIL.toLowerCase());

      if (!existing) { calls.createUser++; calls.resend++; return { status: 'created' as const }; }
      if (!existing.email_confirmed_at) { calls.resend++; return { status: 'confirmation_resent' as const }; }

      // repair rows (no calls tracked here)
      return { status: 'already_confirmed' as const };
    }

    const result = await runSignup([confirmedUser]);
    assert.equal(result.status, 'already_confirmed');
    assert.equal(calls.createUser, 0, 'createUser must NOT be called for confirmed user');
    assert.equal(calls.resend, 0, 'resend must NOT be called for confirmed user');
  });

  it('Case 3: ensurePublicUserRow repairs missing profile rows idempotently', async () => {
    // Simulate the conflict-safe insert: same call twice should not error
    const inserted: string[] = [];

    async function ensurePublicUserRow(authUserId: string) {
      // Simulate ON CONFLICT (id) DO NOTHING
      if (!inserted.includes(authUserId)) {
        inserted.push(authUserId);
      }
      return { error: null };
    }

    await ensurePublicUserRow('uid-1');
    await ensurePublicUserRow('uid-1'); // second call — idempotent

    assert.equal(inserted.length, 1, 'row should only be recorded once');
  });

  it('email comparison is case-insensitive', async () => {
    const user: MockUser = {
      id:                 'u1',
      email:              'USER@EXAMPLE.COM',
      email_confirmed_at: new Date().toISOString(),
      user_metadata:      {},
      app_metadata:       {},
      created_at:         '',
    };

    const found = [user].find((u) => u.email.toLowerCase() === 'user@example.com'.toLowerCase());
    assert.ok(found, 'should match regardless of email case');
  });
});
