'use client';

import useSWR from 'swr';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function getToken(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceFlag {
  id: string;
  type: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  message: string;
  status: 'open' | 'acknowledged' | 'dismissed' | 'escalated';
  comment: string | null;
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

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  position: number;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  net_amount: number | null;
  vat_rate: string | null;
  vat_amount: number | null;
  gross_amount: number | null;
  raw_text: string | null;
  source: string;
  confidence: number | null;
  page_number: number | null;
  bbox: { x: number; y: number; width: number; height: number } | null;
  confirmed: boolean;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
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

export interface AuditLogEntry {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  user_id: string;
  created_at: string;
}

// ─── Primary hook ─────────────────────────────────────────────────────────────

export function useInvoiceDetail(invoiceId: string | null) {
  const key = invoiceId ? `invoice-detail-${invoiceId}` : null;

  const { data, error, isLoading, mutate } = useSWR<InvoiceDetailResponse>(
    key,
    () => apiFetch<InvoiceDetailResponse>(`/api/invoices/${invoiceId}`),
    { revalidateOnFocus: false, dedupingInterval: 10_000 }
  );

  // ── Update flag status (acknowledge / dismiss / reopen / escalate) ──────────
  async function updateFlag(
    flagId: string,
    status: 'acknowledged' | 'dismissed' | 'open' | 'escalated'
  ) {
    if (!invoiceId || !data) return;

    // Optimistic
    await mutate(
      {
        ...data,
        flags: data.flags.map((f) => (f.id === flagId ? { ...f, status } : f)),
      },
      false
    );

    try {
      await apiFetch(`/api/invoices/${invoiceId}/flags/${flagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      await mutate(); // revert
      throw err;
    }

    await mutate();
  }

  // ── Add flag (manual) ────────────────────────────────────────────────────────
  async function addFlag(payload: {
    type: string;
    severity: InvoiceFlag['severity'];
    message: string;
  }) {
    if (!invoiceId) return;

    const created = await apiFetch<InvoiceFlag>(`/api/invoices/${invoiceId}/flags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Optimistic insert at head of flags list
    if (data) {
      await mutate(
        { ...data, flags: [created, ...data.flags] },
        false
      );
    }

    await mutate();
    return created;
  }

  // ── Add review (optimistic) ──────────────────────────────────────────────────
  async function addReview(
    reviewStatus: 'reviewed' | 'approved' | 'flagged_for_follow_up',
    note?: string
  ) {
    if (!invoiceId) return;

    // Optimistic: prepend a placeholder review
    const placeholder: InvoiceReview = {
      id: `optimistic-${Date.now()}`,
      status: reviewStatus,
      note: note ?? null,
      reviewer_id: '',
      created_at: new Date().toISOString(),
    };

    if (data) {
      await mutate(
        { ...data, reviews: [placeholder, ...data.reviews] },
        false
      );
    }

    try {
      await apiFetch(`/api/invoices/${invoiceId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: reviewStatus, note }),
      });
    } catch (err) {
      await mutate(); // revert
      throw err;
    }

    await mutate();
  }

  // ── Download signed URL ──────────────────────────────────────────────────────
  async function getDownloadUrl(): Promise<string> {
    if (!invoiceId) throw new Error('No invoice ID');
    const json = await apiFetch<{ url: string }>(
      `/api/invoices/${invoiceId}/download`,
      { method: 'POST' }
    );
    return json.url;
  }

  // ── Delete invoice ───────────────────────────────────────────────────────────
  async function deleteInvoice(): Promise<void> {
    if (!invoiceId) throw new Error('No invoice ID');
    await apiFetch(`/api/invoices/${invoiceId}`, { method: 'DELETE' });
  }

  return {
    data,
    error,
    isLoading,
    mutate,
    updateFlag,
    addFlag,
    addReview,
    getDownloadUrl,
    deleteInvoice,
  };
}

// ─── Invoice line items hook ──────────────────────────────────────────────────

export interface ParseItemsResponse {
  items: InvoiceLineItem[];
  source: string;
  averageConfidence: number;
  errors: string[];
  message?: string;
}

export function useInvoiceItems(invoiceId: string | null) {
  const key = invoiceId ? `invoice-items-${invoiceId}` : null;

  const { data, error, isLoading, mutate } = useSWR<{ items: InvoiceLineItem[] }>(
    key,
    () => apiFetch<{ items: InvoiceLineItem[] }>(`/api/invoices/${invoiceId}/items`),
    { revalidateOnFocus: false, dedupingInterval: 10_000 }
  );

  async function parseItems(): Promise<ParseItemsResponse> {
    if (!invoiceId) throw new Error('No invoice ID');
    const result = await apiFetch<ParseItemsResponse>(
      `/api/invoices/${invoiceId}/items/parse`,
      { method: 'POST' }
    );
    await mutate();
    return result;
  }

  async function confirmItems(): Promise<void> {
    if (!invoiceId) return;
    await apiFetch(`/api/invoices/${invoiceId}/items/confirm`, { method: 'POST' });
    await mutate();
  }

  async function updateItem(
    itemId: string,
    patch: {
      position: number;
      description: string;
      quantity: number;
      unit: string;
      unit_price: number;
      net_amount: number;
      vat_rate: string;
      vat_amount: number;
      gross_amount: number;
    }
  ): Promise<void> {
    if (!invoiceId) return;
    await apiFetch(`/api/invoices/${invoiceId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await mutate();
  }

  return {
    items: data?.items ?? [],
    error,
    isLoading,
    mutate,
    parseItems,
    confirmItems,
    updateItem,
  };
}

// ─── Vendor summary hook ──────────────────────────────────────────────────────

export function useVendorSummary(vendorId: string | null) {
  return useSWR<VendorSummaryResponse>(
    vendorId ? `vendor-summary-${vendorId}` : null,
    () => apiFetch<VendorSummaryResponse>(`/api/vendors/${vendorId}`),
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );
}

// ─── Audit log hook (admin/owner only) ───────────────────────────────────────

export function useInvoiceAuditLog(invoiceId: string | null) {
  return useSWR<AuditLogEntry[]>(
    invoiceId ? `invoice-audit-${invoiceId}` : null,
    async () => {
      const { data, error } = await supabase.rpc('get_invoice_audit_log', {
        p_invoice_id: invoiceId!,
        p_limit: 50,
      });
      if (error) throw error;
      return (data ?? []) as AuditLogEntry[];
    },
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );
}
