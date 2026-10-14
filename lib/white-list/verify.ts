import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WhiteListStatus = 'VALID' | 'INVALID' | 'NOT_FOUND' | 'ERROR';

export interface WhiteListResult {
  status: WhiteListStatus;
  companyName: string | null;
  taxId: string | null;
  bankAccount: string | null;
  message: string;
}

interface MfWhiteListResponse {
  result: {
    subject?: {
      nip?: string;
      name?: string;
      workingAddress?: string;
    };
    accountStatus?: string; // "Posiada" / "Nie posiada" / "Brak konta"
    accounts?: Array<{ bankAccount?: string }>;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalizes a bank account for the White List API.
 *
 * The MF API requires exactly 26 digits (Polish NRB format).
 * IBAN strings like "PL61 1020 ...26 digits" must have the "PL" prefix
 * and whitespace stripped before submission.
 *
 * Returns the 26-digit NRB string, or an empty string if the account
 * does not contain 26 digits after stripping non-digit characters.
 */
function normalizeAccount(account: string): string {
  // Strip whitespace, dashes, and the PL country prefix (case-insensitive)
  let cleaned = account.replace(/[\s\-]/g, '').toUpperCase();
  if (cleaned.startsWith('PL')) {
    cleaned = cleaned.slice(2);
  }
  // Extract only digits
  const digits = cleaned.replace(/[^0-9]/g, '');
  // The MF API requires exactly 26 digits
  if (digits.length !== 26) return '';
  return digits;
}

function normalizeNip(nip: string): string {
  return nip.replace(/[^0-9]/g, '');
}

function formatDate(date: string | null | undefined): string {
  if (!date) return new Date().toISOString().slice(0, 10);
  try {
    return new Date(date).toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ─── Core verification ─────────────────────────────────────────────────────────

/**
 * Verifies a vendor's bank account against the Polish VAT White List (Biała Lista).
 *
 * Uses the official MF API: https://wl-api.mf.gov.pl
 * Endpoint: /api/check/nip/{nip}/bank-account/{account}?date={YYYY-MM-DD}
 */
export async function verifyOnWhiteList(
  nip: string,
  bankAccount: string,
  invoiceDate: string | null
): Promise<WhiteListResult> {
  const cleanNip = normalizeNip(nip);
  const cleanAccount = normalizeAccount(bankAccount);
  const date = formatDate(invoiceDate);

  if (!cleanNip || cleanNip.length < 8) {
    return {
      status: 'ERROR',
      companyName: null,
      taxId: null,
      bankAccount: cleanAccount,
      message: 'Invalid NIP number',
    };
  }

  if (!cleanAccount) {
    return {
      status: 'ERROR',
      companyName: null,
      taxId: cleanNip,
      bankAccount: bankAccount,
      message: 'Invalid bank account number — Polish bank accounts require exactly 26 digits',
    };
  }

  const baseUrl = 'https://wl-api.mf.gov.pl';
  const url = `${baseUrl}/api/check/nip/${cleanNip}/bank-account/${cleanAccount}?date=${date}&format=json`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeout);

    if (res.status === 404) {
      // MF API returns 404 when the entity is not found on the White List
      return {
        status: 'NOT_FOUND',
        companyName: null,
        taxId: cleanNip,
        bankAccount: cleanAccount,
        message: 'Vendor not found on VAT White List',
      };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        status: 'ERROR',
        companyName: null,
        taxId: cleanNip,
        bankAccount: cleanAccount,
        message: `White List API returned HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    }

    const data: MfWhiteListResponse = await res.json();
    const result = data.result;

    if (!result) {
      return {
        status: 'ERROR',
        companyName: null,
        taxId: cleanNip,
        bankAccount: cleanAccount,
        message: 'Empty response from White List API',
      };
    }

    const subject = result.subject;
    const accountStatus = result.accountStatus;

    if (!subject) {
      return {
        status: 'NOT_FOUND',
        companyName: null,
        taxId: cleanNip,
        bankAccount: cleanAccount,
        message: 'Vendor not found on VAT White List',
      };
    }

    const companyName = subject.name ?? null;
    const taxId = subject.nip ?? cleanNip;

    // accountStatus "Posiada" = the account is assigned to this entity
    if (accountStatus && accountStatus.toLowerCase() === 'posiada') {
      return {
        status: 'VALID',
        companyName,
        taxId,
        bankAccount: cleanAccount,
        message: 'Bank account verified on VAT White List',
      };
    }

    // Double-check: search the accounts array for a match
    if (result.accounts && result.accounts.length > 0) {
      const found = result.accounts.some(
        (a) => a.bankAccount && normalizeAccount(a.bankAccount) === cleanAccount
      );
      if (found) {
        return {
          status: 'VALID',
          companyName,
          taxId,
          bankAccount: cleanAccount,
          message: 'Bank account verified on VAT White List',
        };
      }
    }

    return {
      status: 'INVALID',
      companyName,
      taxId,
      bankAccount: cleanAccount,
      message: 'Bank account not assigned to this vendor on VAT White List',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      status: 'ERROR',
      companyName: null,
      taxId: cleanNip,
      bankAccount: cleanAccount,
      message: `White List verification failed: ${message}`,
    };
  }
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Runs White List verification for an invoice, stores the result, creates audit
 * entries, updates risk flags, and marks vendor bank accounts as verified.
 */
export async function runWhiteListVerification(
  supabase: SupabaseClient<Database>,
  invoiceId: string,
  companyId: string,
  vendorId: string | null,
  sellerNip: string | null,
  bankAccount: string | null,
  invoiceDate: string | null,
  actorId?: string | null
): Promise<WhiteListResult> {
  if (!sellerNip || !bankAccount) {
    const result: WhiteListResult = {
      status: 'ERROR',
      companyName: null,
      taxId: sellerNip ?? null,
      bankAccount: bankAccount ?? null,
      message: 'Missing NIP or bank account for White List verification',
    };
    return result;
  }

  const result = await verifyOnWhiteList(sellerNip, bankAccount, invoiceDate);

  // ── Update invoice with verification result ──────────────────────────────
  await supabase
    .from('invoices')
    .update({
      white_list_status: result.status,
      white_list_verified_at: new Date().toISOString(),
      white_list_company_name: result.companyName,
      white_list_tax_id: result.taxId,
      white_list_bank_account: result.bankAccount,
      white_list_message: result.message,
    })
    .eq('id', invoiceId);

  // ── Create audit entry ───────────────────────────────────────────────────
  const eventType =
    result.status === 'VALID'
      ? 'WHITE_LIST_CHECK_SUCCESS'
      : result.status === 'ERROR'
      ? 'WHITE_LIST_CHECK_FAILED'
      : actorId
      ? 'WHITE_LIST_RECHECK'
      : 'WHITE_LIST_CHECK_FAILED';

  await supabase.from('white_list_audit').insert({
    invoice_id: invoiceId,
    vendor_id: vendorId,
    company_id: companyId,
    nip: sellerNip,
    iban: bankAccount,
    result: result.status,
    message: result.message,
    actor_id: actorId ?? null,
    event_type: eventType,
  });

  // ── Risk engine integration: create/remove risk flag ─────────────────────
  if (result.status === 'INVALID' || result.status === 'NOT_FOUND') {
    // Remove any existing BANK_ACCOUNT_NOT_ON_WHITE_LIST flag to avoid duplicates
    await supabase
      .from('risk_flags')
      .delete()
      .eq('invoice_id', invoiceId)
      .eq('type', 'BANK_ACCOUNT_NOT_ON_WHITE_LIST');

    // Create high-severity flag
    await supabase.from('risk_flags').insert({
      invoice_id: invoiceId,
      type: 'BANK_ACCOUNT_NOT_ON_WHITE_LIST',
      severity: 'high',
      message:
        result.status === 'INVALID'
          ? `Bank account ${bankAccount.slice(-4)} is not assigned to vendor (NIP ${sellerNip}) on the VAT White List.`
          : `Vendor (NIP ${sellerNip}) not found on the VAT White List. Bank account cannot be verified.`,
      status: 'open',
    });

    // Elevate overall risk to HIGH
    await supabase
      .from('invoices')
      .update({ overall_risk: 'high' })
      .eq('id', invoiceId);
  } else if (result.status === 'VALID') {
    // Remove the flag if it existed (status may have changed on recheck)
    await supabase
      .from('risk_flags')
      .delete()
      .eq('invoice_id', invoiceId)
      .eq('type', 'BANK_ACCOUNT_NOT_ON_WHITE_LIST');

    // Recompute overall risk from remaining open flags
    const { data: remainingFlags } = await supabase
      .from('risk_flags')
      .select('severity')
      .eq('invoice_id', invoiceId)
      .eq('status', 'open');

    const severities = (remainingFlags ?? []).map((f) => f.severity);
    let newRisk: 'low' | 'medium' | 'high' | 'critical' | null = null;
    if (severities.includes('critical')) newRisk = 'critical';
    else if (severities.includes('high')) newRisk = 'high';
    else if (severities.includes('medium')) newRisk = 'medium';
    else if (severities.length > 0) newRisk = 'low';

    await supabase
      .from('invoices')
      .update({ overall_risk: newRisk })
      .eq('id', invoiceId);
  }

  // ── Vendor bank account integration ──────────────────────────────────────
  if (result.status === 'VALID' && vendorId) {
    const cleanAccount = normalizeAccount(bankAccount);

    // Check if this bank account already exists for the vendor
    const { data: existing } = await supabase
      .from('vendor_bank_accounts')
      .select('id')
      .eq('vendor_id', vendorId)
      .eq('bank_account_number', cleanAccount)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('vendor_bank_accounts')
        .update({
          verified_on_white_list: true,
          verification_date: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('vendor_bank_accounts').insert({
        vendor_id: vendorId,
        bank_account_number: cleanAccount,
        source: 'invoice',
        verified_on_white_list: true,
        verification_date: new Date().toISOString(),
      });
    }
  }

  return result;
}
