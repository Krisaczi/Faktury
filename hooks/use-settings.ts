'use client';

import useSWR from 'swr';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

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

async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.json();
}

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface CompanySettings {
  id: string;
  name: string;
  nip: string | null;
  currency: string;
  ingestion_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanySettingsResponse {
  company: CompanySettings;
  role: 'owner' | 'accountant';
}

export interface BillingAuditEntry {
  id: string;
  company_id: string;
  actor_id: string;
  old_package: string;
  new_package: string;
  provider: string;
  event_type: string;
  from_plan: string;
  to_plan: string;
  created_at: string;
}

export interface BillingStatusResponse {
  product_type: 'starter' | 'professional';
  plan_source: string;
  auditHistory?: BillingAuditEntry[];
  canUpgrade?: boolean;
}

export interface CompanyUpdateInput {
  name?: string;
  nip?: string | null;
  currency?: string;
}

// ─── Hooks ─────────────────────────────────────────────────────────────────────
export function useCompanySettings() {
  const { data, error, isLoading, mutate } = useSWR<CompanySettingsResponse>(
    'company-settings',
    () => apiGet<CompanySettingsResponse>('/api/companies/me'),
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );

  async function updateCompany(input: CompanyUpdateInput): Promise<CompanySettings> {
    const result = await apiPost<{ company: CompanySettings }>('/api/companies/update', input);
    await mutate((prev) => prev ? { ...prev, company: result.company } : prev, false);
    await mutate();
    return result.company;
  }

  return { data, error, isLoading, mutate, updateCompany };
}

export function useBillingStatus() {
  return useSWR<BillingStatusResponse>(
    'billing-status',
    () => apiGet<BillingStatusResponse>('/api/billing/status'),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
}

export function useUpgradePlan() {
  async function upgradePlan(): Promise<{ product_type: 'starter' | 'professional'; message: string }> {
    return apiPost<{ product_type: 'starter' | 'professional'; message: string }>('/api/billing/upgrade');
  }
  return { upgradePlan };
}

export async function logIngestionEmailCopy() {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  await fetch('/api/audit/copy-ingestion-email', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
