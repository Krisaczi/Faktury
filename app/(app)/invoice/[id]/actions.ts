'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { InvoiceChargeRow, ChargeReconciliation } from '@/types/invoice-charge';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface InvoicePreviewData {
  charges: InvoiceChargeRow[];
  chargesTotal: number | null;
  amountDue: number | null;
  reconciliation: ChargeReconciliation | null;
}

/**
 * Fetches all Rozliczenie data for an invoice preview: charges, totals,
 * and reconciliation status.
 */
export async function getInvoicePreviewData(
  invoiceId: string
): Promise<ActionResult<InvoicePreviewData>> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const { data: userRecord } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) {
      return { ok: false, error: 'Unauthorized' };
    }

    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, company_id, charges_total, amount_due')
      .eq('id', invoiceId)
      .eq('company_id', userRecord.company_id)
      .maybeSingle();

    if (!invoice) {
      return { ok: false, error: 'Invoice not found' };
    }

    const { data: charges } = await supabase
      .from('invoice_charges')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: true });

    const chargesTotal = invoice.charges_total as number | null;
    const amountDue = invoice.amount_due as number | null;
    const sumOfCharges = (charges ?? []).reduce(
      (s, c) => s + (c.amount as number), 0
    );

    const reconciliation: ChargeReconciliation = {
      sumOfCharges,
      chargesTotal,
      amountDue,
      mismatch: chargesTotal != null && Math.abs(chargesTotal - sumOfCharges) > 0.01,
      difference: chargesTotal != null ? chargesTotal - sumOfCharges : 0,
    };

    return {
      ok: true,
      data: {
        charges: (charges ?? []) as unknown as InvoiceChargeRow[],
        chargesTotal,
        amountDue,
        reconciliation,
      },
    };
  } catch {
    return { ok: false, error: 'Internal server error' };
  }
}

/**
 * Re-parse an invoice's Rozliczenie charges. Delegates to the parse API
 * endpoint's logic by calling it internally. Idempotent: re-parsing the
 * same XML will not create duplicate charges.
 */
export async function reparseInvoice(
  invoiceId: string
): Promise<ActionResult<{ count: number; mismatch: boolean }>> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const { data: userRecord } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) {
      return { ok: false, error: 'Unauthorized' };
    }

    // All authenticated company members (owner + accountant) can trigger reparse
    if (!['owner', 'accountant'].includes(userRecord.role ?? '')) {
      return { ok: false, error: 'Forbidden: insufficient role' };
    }

    // Call the internal parse endpoint via fetch
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/invoices/${invoiceId}/charges/parse`, {
      method: 'POST',
      headers: {
        Cookie: '', // server-side; auth handled via supabase session
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error ?? 'Reparse failed' };
    }

    const result = await res.json();
    return {
      ok: true,
      data: {
        count: result.charges?.length ?? 0,
        mismatch: result.reconciliation?.mismatch ?? false,
      },
    };
  } catch {
    return { ok: false, error: 'Internal server error' };
  }
}
