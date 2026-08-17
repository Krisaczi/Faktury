/**
 * Role hierarchy:
 *   owner      — singleton (Krzysztof); full access to all features + user management
 *   accountant — default role for all new users; invoicing rights depend on package
 *
 * The "admin" role has been removed. Role alone does NOT grant invoicing —
 * the company's package determines that (except for owner, which is always full).
 */

export type AppRole = 'owner' | 'accountant';

// ─── Package types ────────────────────────────────────────────────────────────

export type PackageType = 'starter' | 'professional';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the user can access invoicing features.
 * Owner always can. Accountant can only if the company is on a Pro package.
 */
export function canAccessInvoicing(role: string | null | undefined, packageType: string | null | undefined): boolean {
  if (role === 'owner') return true;
  if (role !== 'accountant') return false;
  return packageType === 'professional';
}

export function canWriteInvoice(role: string | null | undefined, packageType: string | null | undefined): boolean {
  return canAccessInvoicing(role, packageType);
}

export function canIssueInvoice(role: string | null | undefined, packageType: string | null | undefined): boolean {
  return canAccessInvoicing(role, packageType);
}

export function canSendToKsef(role: string | null | undefined, packageType: string | null | undefined): boolean {
  return canAccessInvoicing(role, packageType);
}

/**
 * Customer management: only accountants on the Professional plan (and owners)
 * can access the dedicated /customers page and perform CRUD on customers.
 */
export function canManageCustomers(role: string | null | undefined, packageType: string | null | undefined): boolean {
  if (role === 'owner') return true;
  if (role !== 'accountant') return false;
  return packageType === 'professional';
}

/**
 * Owner and accountants can manage bank accounts for their own company.
 */
export function canManageBankAccounts(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'accountant';
}

/**
 * Only the owner can delete invoices.
 */
export function canDeleteInvoice(role: string | null | undefined): boolean {
  return role === 'owner';
}

// ─── Role labels ──────────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<AppRole, string> = {
  owner:      'Właściciel',
  accountant: 'Księgowy',
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  owner:      'Pełny dostęp do wszystkich funkcji i zarządzania użytkownikami',
  accountant: 'Dostęp zależny od pakietu: Starter (podgląd tylko), Pro (pełne fakturowanie)',
};
