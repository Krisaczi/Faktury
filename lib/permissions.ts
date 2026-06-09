/**
 * Role hierarchy:
 *   owner      — singleton; full access to all features and user management
 *   admin      — full invoicing access; cannot manage roles or active status
 *   accountant — create, edit, issue, send to KSeF; no delete
 */

export type AppRole = 'owner' | 'admin' | 'accountant';

/** Roles that may access any part of the invoicing module. */
export const INVOICING_ROLES: AppRole[] = ['owner', 'admin', 'accountant'];

/** Roles allowed to create and edit invoice drafts. */
export const CAN_WRITE_INVOICE: AppRole[] = ['owner', 'admin', 'accountant'];

/** Roles allowed to issue (finalise) an invoice. */
export const CAN_ISSUE_INVOICE: AppRole[] = ['owner', 'admin', 'accountant'];

/** Roles allowed to send an invoice to KSeF. */
export const CAN_SEND_KSEF: AppRole[] = ['owner', 'admin', 'accountant'];

/** Roles allowed to delete an invoice. */
export const CAN_DELETE_INVOICE: AppRole[] = ['owner', 'admin'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function canAccessInvoicing(role: string | null | undefined): boolean {
  return INVOICING_ROLES.includes(role as AppRole);
}

export function canWriteInvoice(role: string | null | undefined): boolean {
  return CAN_WRITE_INVOICE.includes(role as AppRole);
}

export function canIssueInvoice(role: string | null | undefined): boolean {
  return CAN_ISSUE_INVOICE.includes(role as AppRole);
}

export function canSendToKsef(role: string | null | undefined): boolean {
  return CAN_SEND_KSEF.includes(role as AppRole);
}

export function canDeleteInvoice(role: string | null | undefined): boolean {
  return CAN_DELETE_INVOICE.includes(role as AppRole);
}

// ─── Role labels ──────────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<AppRole, string> = {
  owner:      'Właściciel',
  admin:      'Administrator',
  accountant: 'Księgowy',
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  owner:      'Pełny dostęp do wszystkich funkcji i zarządzania użytkownikami',
  admin:      'Pełny dostęp do fakturowania i podglądu',
  accountant: 'Tworzenie, edycja i wysyłanie faktur',
};
