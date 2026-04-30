'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/auth-provider';

export interface CompanyVendor {
  id: string;
  company_id: string;
  name: string;
  nip: string;
  bank_accounts: string[];
  avg_amount: number;
  created_at: string;
  updated_at: string;
}

export function useCompanyVendors() {
  const { user } = useAuth();
  const supabase = createClient();

  const fetcher = async (): Promise<CompanyVendor[]> => {
    if (!user?.id) return [];

    const { data: userRow } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    const companyId = userRow?.company_id;
    if (!companyId) return [];

    const { data, error } = await supabase
      .from('company_vendors')
      .select('*')
      .eq('company_id', companyId)
      .order('name', { ascending: true });

    if (error) throw new Error(error.message ?? 'Failed to fetch vendors');
    return (data ?? []) as CompanyVendor[];
  };

  return useSWR(user?.id ? `company-vendors-${user.id}` : null, fetcher, {
    refreshInterval: 60_000,
  });
}
