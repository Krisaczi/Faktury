/**
 * Centralized package-based invoicing guard.
 * Used by all invoice mutation routes (create, update, delete, send).
 *
 * Rules:
 *   - Owner: full invoicing regardless of package
 *   - Accountant on Professional/Pro package: full invoicing
 *   - Accountant on Starter package: read-only KSeF preview only — NO mutations
 */

export interface ReqUser {
  role:       string;
  companyId:  string | null;
  packageType: string | null;
}

export interface InvoicingCheckResult {
  allowed:  boolean;
  reason?:  string;
  code?:    string;
  status?:  number;
}

/**
 * Returns true if the user is allowed to perform invoice mutations.
 * Role alone does NOT grant invoicing — package determines it (except owner).
 */
export function requireProForInvoicing(user: ReqUser): InvoicingCheckResult {
  // Owner bypasses package check
  if (user.role === 'owner') {
    return { allowed: true };
  }

  // Non-accountant roles are not recognized
  if (user.role !== 'accountant') {
    return {
      allowed: false,
      reason:  'Nieznana rola. Skontaktuj się z obsługą.',
      code:    'UNKNOWN_ROLE',
      status:  403,
    };
  }

  // Accountant: must be on Professional/Pro package
  if (user.packageType !== 'professional') {
    return {
      allowed: false,
      reason:  'Fakturowanie jest dostępne tylko w planie Professional. Twój plan Starter pozwala tylko na podgląd faktur z KSeF.',
      code:    'INVOICING_NOT_AVAILABLE',
      status:  403,
    };
  }

  return { allowed: true };
}

/**
 * Returns true if the user can read/preview KSeF invoices (read-only).
 * All authenticated users with a company can preview KSeF invoices.
 */
export function canPreviewKsefInvoices(user: Pick<ReqUser, 'role' | 'companyId'>): boolean {
  return (user.role === 'owner' || user.role === 'accountant') && !!user.companyId;
}
