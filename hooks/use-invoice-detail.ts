'use client';

import useSWR, { mutate as globalMutate } from 'swr';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface InvoiceFlag {
  id: string;
  type: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  message: string;
  status: 'open' | 'acknowledged' | 'dismissed';
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface InvoiceReview {
  id: string;
  status: 'reviewed' | 'approved' | 'flagged_for_follow_up';
  note: string | null;
  reviewer_id: string;
  created_at: string;
}

export interface InvoiceVendor {
  id: string;
  name: string;
  category: string | null;
  risk_score: number | null;
  status: 'active' | 'inactive' | 'under_review';
  contact_email: string | null;
}

export interface InvoiceDetail {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  issue_date: string | null;
  due_date: string | null;
  amount: number | null;
  tax_amount: number | null;
  currency: string;
  seller_nip: string | null;
  buyer_nip: string | null;
  bank_account: string | null;
  raw_file_url: string | null;
  overall_risk: 'low' | 'medium' | 'high' | 'critical' | null;
  vendor_id: string | null;
  upload_session_id: string | null;
  created_at: string;
}

export interface InvoiceDetailResponse {
  invoice: InvoiceDetail;
  flags: InvoiceFlag[];
  reviews: InvoiceReview[];
  vendor: InvoiceVendor | null;
}

export interface VendorStats {
  total_invoices: number;
  total_amount: number;
  high_risk_count: number;
  avg_risk_score: number | null;
}

export interface VendorRecentInvoice {
  id: string;
  invoice_number: string | null;
  issue_date: string | null;
  amount: number | null;
  currency: string;
  overall_risk: string | null;
}

export interface VendorSummaryResponse {
  vendor: InvoiceVendor & { created_at: string };
  stats: VendorStats;
  recent_invoices: VendorRecentInvoice[];
}

async function fetchInvoiceDetail(invoiceId: string): Promise<InvoiceDetailResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const res = await fetch(`/api/invoices/${invoiceId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to load invoice' }));
    throw new Error(err.error ?? 'Failed to load invoice');
  }
  return res.json();
}

async function fetchVendorSummary(vendorId: string): Promise<VendorSummaryResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const res = await fetch(`/api/vendors/${vendorId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to load vendor' }));
    throw new Error(err.error ?? 'Failed to load vendor');
  }
  return res.json();
}

export function useInvoiceDetail(invoiceId: string | null) {
  const key = invoiceId ? `invoice-detail-${invoiceId}` : null;

  const { data, error, isLoading, mutate } = useSWR<InvoiceDetailResponse>(
    key,
    () => fetchInvoiceDetail(invoiceId!),
    { revalidateOnFocus: false, dedupingInterval: 10_000 }
  );

  async function updateFlag(flagId: string, status: 'acknowledged' | 'dismissed' | 'open') {
    if (!invoiceId || !data) return;

    // Optimistic update
    const optimistic: InvoiceDetailResponse = {
      ...data,
      flags: data.flags.map((f) =>
        f.id === flagId ? { ...f, status } : f
      ),
    };
    await mutate(optimistic, false);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch(`/api/invoices/${invoiceId}/flags/${flagId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) throw new Error('Failed to update flag');
    } catch {
      // Revert on failure
      await mutate();
      throw new Error('Failed to update flag');
    }

    await mutate();
  }

  async function addReview(reviewStatus: 'reviewed' | 'approved' | 'flagged_for_follow_up', note?: string) {
    if (!invoiceId) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const res = await fetch(`/api/invoices/${invoiceId}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ status: reviewStatus, note }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to submit review' }));
      throw new Error(err.error ?? 'Failed to submit review');
    }

    await mutate();
    return res.json();
  }

  async function getDownloadUrl(): Promise<string> {
    if (!invoiceId) throw new Error('No invoice ID');

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const res = await fetch(`/api/invoices/${invoiceId}/download`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to generate download URL' }));
      throw new Error(err.error ?? 'Failed to generate download URL');
    }

    const json = await res.json();
    return json.url as string;
  }

  return {
    data,
    error,
    isLoading,
    mutate,
    updateFlag,
    addReview,
    getDownloadUrl,
  };
}

export function useVendorSummary(vendorId: string | null) {
  return useSWR<VendorSummaryResponse>(
    vendorId ? `vendor-summary-${vendorId}` : null,
    () => fetchVendorSummary(vendorId!),
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );
}
