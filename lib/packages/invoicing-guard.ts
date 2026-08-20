/**
 * Centralized package-based invoicing guard.
 * Used by all invoice mutation routes (create, update, delete, send).
 *
 * Rules:
 *   - Owner: full invoicing regardless of package
 *   - Accountant on any plan: full invoicing (Starter is now limited by count, not by access)
 *   - Invoice count limits are enforced separately by checkInvoiceLimit
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
 * Both Starter and Professional plans now have full invoicing mode.
 * Monthly count limits are enforced separately in the invoice issuance flow.
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

  // Both Starter and Professional have full invoicing mode
  // Monthly count limits are enforced by checkInvoiceLimit in the issuance flow
  return { allowed: true };
}

/**
 * Returns true if the user can read/preview KSeF invoices (read-only).
 * All authenticated users with a company can preview KSeF invoices.
 */
export function canPreviewKsefInvoices(user: Pick<ReqUser, 'role' | 'companyId'>): boolean {
  return (user.role === 'owner' || user.role === 'accountant') && !!user.companyId;
}
