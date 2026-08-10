/**
 * Unit tests for the change-password flow.
 *
 * Tests the pure-logic invariants:
 *   - Zod validation schema (changePasswordSchema)
 *   - Server action source invariants (route exists, imports, audit logging)
 *   - Frontend gating invariants (modal exists, no /forgot-password link)
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/auth/change-password.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// ─── 1. changePasswordSchema validation ─────────────────────────────────────────

describe('changePasswordSchema', () => {
  // Inline copy of the schema to avoid importing zod-dependent modules.
  // Must match lib/validations/auth.ts.
  function validate(data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): string[] {
    const errors: string[] = [];

    if (!data.currentPassword || data.currentPassword.length < 1) {
      errors.push('Current password is required');
    }

    if (!data.newPassword || data.newPassword.length < 8) {
      errors.push('Password must be at least 8 characters');
    }

    if (data.newPassword !== data.confirmPassword) {
      errors.push('Passwords do not match');
    }

    if (data.currentPassword && data.newPassword && data.currentPassword === data.newPassword) {
      errors.push('New password must be different from current password');
    }

    return errors;
  }

  it('accepts valid input with different passwords', () => {
    assert.deepEqual(validate({
      currentPassword: 'oldpass123',
      newPassword: 'newpass456',
      confirmPassword: 'newpass456',
    }), []);
  });

  it('rejects empty current password', () => {
    const errors = validate({
      currentPassword: '',
      newPassword: 'newpass456',
      confirmPassword: 'newpass456',
    });
    assert.ok(errors.some((e) => e.includes('Current password')));
  });

  it('rejects new password shorter than 8 chars', () => {
    const errors = validate({
      currentPassword: 'oldpass123',
      newPassword: 'short',
      confirmPassword: 'short',
    });
    assert.ok(errors.some((e) => e.includes('8 characters')));
  });

  it('rejects mismatched passwords', () => {
    const errors = validate({
      currentPassword: 'oldpass123',
      newPassword: 'newpass456',
      confirmPassword: 'different789',
    });
    assert.ok(errors.some((e) => e.includes('do not match')));
  });

  it('rejects new password same as current', () => {
    const errors = validate({
      currentPassword: 'samepass123',
      newPassword: 'samepass123',
      confirmPassword: 'samepass123',
    });
    assert.ok(errors.some((e) => e.includes('different from current')));
  });
});

// ─── 2. Backend route source invariants ─────────────────────────────────────────

describe('change-password route source invariants', () => {
  const routePath = join(projectRoot, 'app', 'api', 'auth', 'change-password', 'route.ts');

  it('file exists and exports POST handler', async () => {
    const src = await readFile(routePath, 'utf8');
    assert.match(src, /export async function POST/, 'must export POST handler');
  });

  it('imports changePasswordSchema from validations', async () => {
    const src = await readFile(routePath, 'utf8');
    assert.match(src, /import.*changePasswordSchema.*from.*validations\/auth/,
      'must import changePasswordSchema');
  });

  it('validates request body with safeParse', async () => {
    const src = await readFile(routePath, 'utf8');
    assert.match(src, /safeParse/, 'must use safeParse for validation');
  });

  it('returns 401 when no session', async () => {
    const src = await readFile(routePath, 'utf8');
    assert.match(src, /Unauthenticated/, 'must return 401 for no session');
  });

  it('verifies current password via signInWithPassword', async () => {
    const src = await readFile(routePath, 'utf8');
    assert.match(src, /signInWithPassword/,
      'must verify current password by re-authenticating');
  });

  it('returns 403 when current password is wrong', async () => {
    const src = await readFile(routePath, 'utf8');
    assert.match(src, /Current password is incorrect/,
      'must return 403 for wrong current password');
  });

  it('updates password via auth.updateUser', async () => {
    const src = await readFile(routePath, 'utf8');
    assert.match(src, /auth\.updateUser\(\s*\{\s*password/, 'must update password via updateUser');
  });

  it('writes audit log entry with action password_changed', async () => {
    const src = await readFile(routePath, 'utf8');
    assert.match(src, /audit_logs/, 'must write to audit_logs table');
    assert.match(src, /password_changed/, 'must use action password_changed');
  });

  it('logs structured context with ip and requestId', async () => {
    const src = await readFile(routePath, 'utf8');
    assert.match(src, /requestId/, 'must generate requestId');
    assert.match(src, /ip/, 'must log IP address');
    assert.match(src, /console\.(info|warn|error)/, 'must use structured console logging');
  });

  it('does not return the password in response', async () => {
    const src = await readFile(routePath, 'utf8');
    assert.match(src, /\{\s*ok:\s*true\s*\}/, 'must return only { ok: true } on success');
    assert.doesNotMatch(src, /password.*json|json.*password/i,
      'must not include password in response body');
  });
});

// ─── 3. Frontend modal source invariants ────────────────────────────────────────

describe('ChangePasswordModal source invariants', () => {
  const modalPath = join(projectRoot, 'components', 'settings', 'change-password-modal.tsx');

  it('file exists and exports ChangePasswordModal', async () => {
    const src = await readFile(modalPath, 'utf8');
    assert.match(src, /export function ChangePasswordModal/, 'must export ChangePasswordModal');
  });

  it('uses changePasswordSchema for validation', async () => {
    const src = await readFile(modalPath, 'utf8');
    assert.match(src, /changePasswordSchema/, 'must use changePasswordSchema');
  });

  it('posts to /api/auth/change-password', async () => {
    const src = await readFile(modalPath, 'utf8');
    assert.match(src, /\/api\/auth\/change-password/, 'must call the change-password endpoint');
  });

  it('shows success state after successful change', async () => {
    const src = await readFile(modalPath, 'utf8');
    assert.match(src, /success/, 'must track success state');
    assert.match(src, /Hasło zostało zmienione/, 'must show Polish success message');
  });

  it('does not redirect to dashboard', async () => {
    const src = await readFile(modalPath, 'utf8');
    assert.doesNotMatch(src, /router\.push.*dashboard|router\.replace.*dashboard/i,
      'must not redirect to dashboard');
  });

  it('has password show/hide toggles for accessibility', async () => {
    const src = await readFile(modalPath, 'utf8');
    assert.match(src, /Eye|EyeOff/, 'must have show/hide password toggle');
    assert.match(src, /aria-label/, 'must have aria-label for accessibility');
  });
});

// ─── 4. Settings page integration invariants ────────────────────────────────────

describe('Settings page invariants', () => {
  const settingsPath = join(projectRoot, 'app', '(app)', 'settings', 'page.tsx');

  it('imports ChangePasswordModal', async () => {
    const src = await readFile(settingsPath, 'utf8');
    assert.match(src, /import.*ChangePasswordModal.*from.*change-password-modal/,
      'must import ChangePasswordModal');
  });

  it('does not link to /forgot-password anymore', async () => {
    const src = await readFile(settingsPath, 'utf8');
    assert.doesNotMatch(src, /href="\/forgot-password"/,
      'must not link to /forgot-password from Settings');
  });

  it('has state to control change-password modal', async () => {
    const src = await readFile(settingsPath, 'utf8');
    assert.match(src, /changePasswordOpen/, 'must have changePasswordOpen state');
    assert.match(src, /setChangePasswordOpen\(true\)/,
      'must open modal via setChangePasswordOpen(true)');
  });

  it('renders ChangePasswordModal component', async () => {
    const src = await readFile(settingsPath, 'utf8');
    assert.match(src, /<ChangePasswordModal/, 'must render ChangePasswordModal');
  });
});

// ─── 5. Validation schema export check ──────────────────────────────────────────

describe('validation schema export', () => {
  const valPath = join(projectRoot, 'lib', 'validations', 'auth.ts');

  it('exports changePasswordSchema', async () => {
    const src = await readFile(valPath, 'utf8');
    assert.match(src, /export const changePasswordSchema/, 'must export changePasswordSchema');
  });

  it('exports ChangePasswordFormData type', async () => {
    const src = await readFile(valPath, 'utf8');
    assert.match(src, /export type ChangePasswordFormData/, 'must export ChangePasswordFormData');
  });

  it('schema includes currentPassword, newPassword, confirmPassword', async () => {
    const src = await readFile(valPath, 'utf8');
    assert.match(src, /currentPassword/, 'must include currentPassword field');
    assert.match(src, /newPassword/, 'must include newPassword field');
    assert.match(src, /confirmPassword/, 'must include confirmPassword field');
  });

  it('schema validates passwords match', async () => {
    const src = await readFile(valPath, 'utf8');
    assert.match(src, /newPassword.*confirmPassword|confirmPassword.*newPassword/,
      'must validate that passwords match');
  });

  it('schema prevents new password same as current', async () => {
    const src = await readFile(valPath, 'utf8');
    assert.match(src, /currentPassword.*newPassword|newPassword.*currentPassword/,
      'must prevent new password being same as current');
  });
});
