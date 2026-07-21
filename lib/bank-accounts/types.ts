/** Shared types for company bank accounts. */

export interface BankAccountRow {
  id: string;
  company_id: string;
  account_holder_name: string;
  iban: string;
  bic: string | null;
  bank_name: string | null;
  is_default: boolean;
  verified: boolean;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBankAccountInput {
  account_holder_name: string;
  iban: string;
  bic?: string | null;
  bank_name?: string | null;
  is_default?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateBankAccountPatch {
  account_holder_name?: string;
  bic?: string | null;
  bank_name?: string | null;
  is_default?: boolean;
  metadata?: Record<string, unknown> | null;
  verified?: boolean;
}

export type BankAccountActionResult =
  | { ok: true; account: BankAccountRow }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type DeleteBankAccountResult =
  | { ok: true; id: string }
  | { ok: false; error: string; requiresOwnerConfirm?: boolean };

/** Mask IBAN for display: show last 4 digits only. */
export function maskIbanForDisplay(iban: string): string {
  const clean = iban.replace(/\s+/g, '').toUpperCase();
  if (clean.length < 8) return clean;
  return `${clean.slice(0, 2)} •••• •••• ${clean.slice(-4)}`;
}

/** Format IBAN in 4-char groups for readable display. */
export function formatIbanForDisplay(iban: string): string {
  const clean = iban.replace(/\s+/g, '').toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
}
