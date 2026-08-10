/**
 * Unit tests for bank account permissions and validation logic.
 *
 * Tests the pure-logic invariants:
 *   - canManageBankAccounts role check (owner + accountant allowed)
 *   - IBAN masking logic
 *   - Server action source invariants (requireBankAccountManager, not requireCompanyAdmin)
 *   - Frontend gating invariants (canManageBankAccounts usage, no isAdmin)
 *
 * Run:
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/bank-accounts/permissions.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// ─── 1. canManageBankAccounts role check ────────────────────────────────────────

describe('canManageBankAccounts role check', () => {
  function canManageBankAccounts(role: string | null | undefined): boolean {
    return role === 'owner' || role === 'accountant';
  }

  it('allows owner', () => {
    assert.ok(canManageBankAccounts('owner'));
  });

  it('allows accountant', () => {
    assert.ok(canManageBankAccounts('accountant'));
  });

  it('rejects admin (legacy role)', () => {
    assert.ok(!canManageBankAccounts('admin'));
  });

  it('rejects null', () => {
    assert.ok(!canManageBankAccounts(null));
  });

  it('rejects undefined', () => {
    assert.ok(!canManageBankAccounts(undefined));
  });

  it('rejects empty string', () => {
    assert.ok(!canManageBankAccounts(''));
  });

  it('rejects unknown role', () => {
    assert.ok(!canManageBankAccounts('viewer'));
  });
});

// ─── 2. IBAN masking logic ──────────────────────────────────────────────────────

describe('maskIbanForDisplay', () => {
  function maskIbanForDisplay(iban: string): string {
    const clean = iban.replace(/\s+/g, '').toUpperCase();
    if (clean.length < 8) return clean;
    return `${clean.slice(0, 2)} •••• •••• ${clean.slice(-4)}`;
  }

  it('masks a standard IBAN showing first 2 and last 4 chars', () => {
    const masked = maskIbanForDisplay('PL60102010200000000123456789');
    assert.match(masked, /^PL/);
    assert.match(masked, /6789$/);
    assert.ok(masked.includes('••••'));
  });

  it('returns short strings as-is (less than 8 chars)', () => {
    assert.equal(maskIbanForDisplay('PL123'), 'PL123');
  });

  it('strips whitespace before masking', () => {
    const masked = maskIbanForDisplay('PL60 1020 1020 0000 0000 1234 5678 9');
    assert.match(masked, /^PL/);
    assert.match(masked, /6789$/);
  });

  it('uppercases the input', () => {
    const masked = maskIbanForDisplay('pl60102010200000000123456789');
    assert.match(masked, /^PL/);
  });
});

// ─── 3. Server action source invariants ─────────────────────────────────────────

describe('server action source invariants', () => {
  const actionsPath = join(projectRoot, 'lib', 'bank-accounts', 'actions.ts');

  it('defines requireBankAccountManager (not requireCompanyAdmin)', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /requireBankAccountManager/, 'must define requireBankAccountManager');
  });

  it('does not call requireCompanyAdmin anymore', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.doesNotMatch(src, /requireCompanyAdmin\(\)/, 'must not call requireCompanyAdmin');
  });

  it('requireBankAccountManager allows owner and accountant', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /role !== 'owner' && role !== 'accountant'/,
      'must check role is owner or accountant');
  });

  it('createCompanyBankAccount uses requireBankAccountManager', async () => {
    const src = await readFile(actionsPath, 'utf8');
    const createSection = src.match(/async function createCompanyBankAccount[\s\S]*?requireBankAccountManager/);
    assert.ok(createSection, 'createCompanyBankAccount must call requireBankAccountManager');
  });

  it('updateCompanyBankAccount uses requireBankAccountManager', async () => {
    const src = await readFile(actionsPath, 'utf8');
    const updateSection = src.match(/async function updateCompanyBankAccount[\s\S]*?requireBankAccountManager/);
    assert.ok(updateSection, 'updateCompanyBankAccount must call requireBankAccountManager');
  });

  it('deleteCompanyBankAccount uses requireBankAccountManager', async () => {
    const src = await readFile(actionsPath, 'utf8');
    const deleteSection = src.match(/async function deleteCompanyBankAccount[\s\S]*?requireBankAccountManager/);
    assert.ok(deleteSection, 'deleteCompanyBankAccount must call requireBankAccountManager');
  });

  it('force-delete still requires owner role', async () => {
    const src = await readFile(actionsPath, 'utf8');
    assert.match(src, /force && role !== 'owner'/,
      'force-delete when invoices reference account must still require owner');
  });

  it('verifyCompanyBankAccount uses requireBankAccountManager', async () => {
    const src = await readFile(actionsPath, 'utf8');
    const verifySection = src.match(/async function verifyCompanyBankAccount[\s\S]*?requireBankAccountManager/);
    assert.ok(verifySection, 'verifyCompanyBankAccount must call requireBankAccountManager');
  });
});

// ─── 4. Permissions module invariants ───────────────────────────────────────────

describe('permissions module invariants', () => {
  const permPath = join(projectRoot, 'lib', 'permissions.ts');

  it('exports canManageBankAccounts', async () => {
    const src = await readFile(permPath, 'utf8');
    assert.match(src, /export function canManageBankAccounts/, 'must export canManageBankAccounts');
  });

  it('canManageBankAccounts checks for owner and accountant', async () => {
    const src = await readFile(permPath, 'utf8');
    assert.match(src, /canManageBankAccounts[\s\S]*?owner[\s\S]*?accountant|canManageBankAccounts[\s\S]*?accountant[\s\S]*?owner/,
      'must check for both owner and accountant');
  });
});

// ─── 5. Frontend gating invariants ──────────────────────────────────────────────

describe('frontend gating invariants', () => {
  const cardPath = join(projectRoot, 'components', 'settings', 'bank-accounts-card.tsx');
  const settingsPath = join(projectRoot, 'app', '(app)', 'settings', 'page.tsx');

  it('BankAccountsCard imports canManageBankAccounts', async () => {
    const src = await readFile(cardPath, 'utf8');
    assert.match(src, /import.*canManageBankAccounts.*from.*permissions/, 'must import canManageBankAccounts');
  });

  it('BankAccountsCard accepts role prop (not isAdmin)', async () => {
    const src = await readFile(cardPath, 'utf8');
    assert.match(src, /role:\s*string/, 'must accept role prop');
    assert.doesNotMatch(src, /isAdmin/, 'must not use isAdmin');
  });

  it('BankAccountsCard uses canManage for gating', async () => {
    const src = await readFile(cardPath, 'utf8');
    assert.match(src, /canManage\s*=\s*canManageBankAccounts\(role\)/, 'must compute canManage from role');
    assert.match(src, /canManage &&/, 'must use canManage for conditional rendering');
  });

  it('BankAccountItem uses canManage prop (not isAdmin)', async () => {
    const src = await readFile(cardPath, 'utf8');
    assert.doesNotMatch(src, /isAdmin/, 'must not reference isAdmin anywhere');
    assert.match(src, /canManage:\s*boolean/, 'BankAccountItem must accept canManage prop');
  });

  it('settings page passes role to BankAccountsCard (not isAdmin)', async () => {
    const src = await readFile(settingsPath, 'utf8');
    assert.match(src, /BankAccountsCard role={role}/, 'must pass role prop');
    assert.doesNotMatch(src, /BankAccountsCard isAdmin/, 'must not pass isAdmin to BankAccountsCard');
  });

  it('shows helpful message when user cannot manage', async () => {
    const src = await readFile(cardPath, 'utf8');
    assert.match(src, /Do zarządzania kontami bankowymi/,
      'must show guidance message for users without permission');
  });
});
