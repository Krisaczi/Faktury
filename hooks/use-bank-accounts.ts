'use client';

import useSWR, { mutate as globalMutate } from 'swr';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type {
  BankAccountRow,
  CreateBankAccountInput,
  UpdateBankAccountPatch,
} from '@/lib/bank-accounts/types';

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

async function apiRequest<T>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(url, {
    method,
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

const SWR_KEY = 'company-bank-accounts';

export function useCompanyBankAccounts() {
  const { data, error, isLoading, mutate } = useSWR<{ accounts: BankAccountRow[] }>(
    SWR_KEY,
    () => apiGet<{ accounts: BankAccountRow[] }>('/api/company/bank-accounts'),
    { revalidateOnFocus: false, dedupingInterval: 15_000 },
  );

  const accounts = data?.accounts ?? [];

  async function createAccount(input: CreateBankAccountInput): Promise<BankAccountRow> {
    const result = await apiRequest<{ account: BankAccountRow }>(
      '/api/company/bank-accounts',
      'POST',
      input,
    );
    await mutate();
    return result.account;
  }

  async function updateAccount(
    id: string,
    patch: UpdateBankAccountPatch,
  ): Promise<BankAccountRow> {
    const result = await apiRequest<{ account: BankAccountRow }>(
      `/api/company/bank-accounts/${id}`,
      'PATCH',
      patch,
    );
    await mutate();
    return result.account;
  }

  async function verifyAccount(id: string): Promise<BankAccountRow> {
    const result = await apiRequest<{ account: BankAccountRow }>(
      `/api/company/bank-accounts/${id}`,
      'PATCH',
      { action: 'verify' },
    );
    await mutate();
    return result.account;
  }

  async function deleteAccount(id: string, force: boolean = false): Promise<void> {
    await apiRequest<{ ok: boolean }>(
      `/api/company/bank-accounts/${id}${force ? '?force=true' : ''}`,
      'DELETE',
    );
    await mutate();
  }

  return {
    accounts,
    error,
    isLoading,
    mutate,
    createAccount,
    updateAccount,
    verifyAccount,
    deleteAccount,
  };
}

/** Refresh bank accounts from server (used after inline add in invoice form). */
export function refreshBankAccounts() {
  return globalMutate(SWR_KEY);
}
