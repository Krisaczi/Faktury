'use client';

import useSWR from 'swr';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Database } from '@/types/database';

type Vendor = Database['public']['Tables']['vendors']['Row'];
type VendorInsert = Database['public']['Tables']['vendors']['Insert'];
type VendorUpdate = Database['public']['Tables']['vendors']['Update'];

// ─── Extended vendor types for profile page ────────────────────────────────────
export interface VendorFull extends Vendor {
  nip: string | null;
  bank_accounts: string[];
  notes: string | null;
}

export interface VendorStats {
  total_invoices: number;
  total_amount: number;
  avg_amount: number;
  high_risk_count: number;
  flagged_count: number;
  open_flags_count: number;
}

export interface VendorLastActivity {
  last_invoice_date: string | null;
  last_invoice_id: string | null;
  last_invoice_number: string | null;
}

export interface VendorDetailResponse {
  vendor: VendorFull;
  stats: VendorStats;
  last_activity: VendorLastActivity;
}

export interface VendorInvoiceRow {
  id: string;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  amount: number | null;
  currency: string;
  overall_risk: 'low' | 'medium' | 'high' | 'critical' | null;
  seller_nip: string | null;
  bank_account: string | null;
  raw_file_url: string | null;
  flag_count: number;
  open_flag_count: number;
  flags: { id: string; type: string; severity: string; message: string; status: string }[];
}

export interface VendorInvoicesResponse {
  rows: VendorInvoiceRow[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface VendorTrendPoint {
  period: string;
  total: number;
  flagged: number;
  high_risk: number;
}

export interface VendorInvoiceFilters {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  riskLevel?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

async function apiGet<T>(url: string): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.json();
}

export function useVendor(vendorId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<VendorDetailResponse>(
    vendorId ? `vendor-detail-${vendorId}` : null,
    () => apiGet<VendorDetailResponse>(`/api/vendors/${vendorId}`),
    { revalidateOnFocus: false, dedupingInterval: 15_000 }
  );

  async function updateVendorProfile(updates: Partial<VendorFull>) {
    if (!vendorId) return;
    const supabase = getSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const res = await fetch(`/api/vendors/${vendorId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Update failed' }));
      throw new Error(err.error ?? 'Update failed');
    }
    await mutate();
    return res.json();
  }

  async function mergeVendor(sourceVendorId: string) {
    if (!vendorId) return;
    const supabase = getSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const res = await fetch(`/api/vendors/${vendorId}/merge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ sourceVendorId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Merge failed' }));
      throw new Error(err.error ?? 'Merge failed');
    }
    await mutate();
    return res.json();
  }

  return { data, error, isLoading, mutate, updateVendorProfile, mergeVendor };
}

export function useVendorInvoices(vendorId: string | null, filters: VendorInvoiceFilters) {
  const {
    page = 1, pageSize = 20, from, to, riskLevel, search,
    sortBy = 'issue_date', sortDir = 'desc',
  } = filters;

  const params = new URLSearchParams();
  params.set('page',    String(page));
  params.set('pageSize', String(pageSize));
  if (from)      params.set('from',      from);
  if (to)        params.set('to',        to);
  if (riskLevel) params.set('riskLevel', riskLevel);
  if (search)    params.set('search',    search);
  params.set('sortBy',  sortBy);
  params.set('sortDir', sortDir);

  return useSWR<VendorInvoicesResponse>(
    vendorId ? `vendor-invoices-${vendorId}-${params.toString()}` : null,
    () => apiGet<VendorInvoicesResponse>(`/api/vendors/${vendorId}/invoices?${params.toString()}`),
    { revalidateOnFocus: false, keepPreviousData: true, dedupingInterval: 5_000 }
  );
}

export function useVendorTrend(
  vendorId: string | null,
  from?: string,
  to?: string,
  granularity: 'day' | 'week' | 'month' = 'week'
) {
  const params = new URLSearchParams({ granularity });
  if (from) params.set('from', from);
  if (to)   params.set('to',   to);

  return useSWR<{ series: VendorTrendPoint[] }>(
    vendorId ? `vendor-trend-${vendorId}-${params.toString()}` : null,
    () => apiGet<{ series: VendorTrendPoint[] }>(`/api/vendors/${vendorId}/trend?${params.toString()}`),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
}

export function useExportVendorCsv(vendorId: string | null) {
  async function exportCsv(filters: { from?: string; to?: string; riskLevel?: string; search?: string }) {
    if (!vendorId) return;
    const supabase = getSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const res = await fetch(`/api/vendors/${vendorId}/export-csv`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(filters),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(err.error ?? 'Export failed');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendor-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { exportCsv };
}

async function fetchVendors(): Promise<Vendor[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function useVendors() {
  const supabase = getSupabaseBrowserClient();
  const { data, error, isLoading, mutate } = useSWR<Vendor[]>(
    'vendors',
    fetchVendors
  );

  const addVendor = async (vendor: Omit<VendorInsert, 'user_id'>) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('vendors')
      .insert({ ...vendor, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    mutate();
    return data;
  };

  const updateVendor = async (id: string, updates: VendorUpdate) => {
    const { error } = await supabase.from('vendors').update(updates).eq('id', id);
    if (error) throw error;
    mutate();
  };

  const deleteVendor = async (id: string) => {
    const { error } = await supabase.from('vendors').delete().eq('id', id);
    if (error) throw error;
    mutate();
  };

  return {
    vendors: data ?? [],
    error,
    isLoading,
    addVendor,
    updateVendor,
    deleteVendor,
    refresh: mutate,
  };
}
