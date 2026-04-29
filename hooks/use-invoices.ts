'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/auth-provider';

export interface CompanyInvoice {
  id: string;
  company_id: string;
  vendor_id: string | null;
  ksef_reference: string;
  invoice_number: string;
  amount: number;
  currency: string;
  issue_date: string | null;
  due_date: string | null;
  bank_account: string;
  overall_risk: string;
  seller_nip: string;
  buyer_nip: string;
  seller_name: string;
  created_at: string;
  updated_at: string;
  company_vendors: { name: string; nip: string } | null;
}

export function useInvoices() {
  const { user } = useAuth();
  const supabase = createClient();

  const fetcher = async (): Promise<CompanyInvoice[]> => {
    if (!user?.id) return [];

    const { data: userRow } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    const companyId = userRow?.company_id;
    if (!companyId) return [];

    const { data, error } = await supabase
      .from('company_invoices')
      .select('*, company_vendors(name, nip)')
      .eq('company_id', companyId)
      .order('issue_date', { ascending: false, nullsFirst: false });

    if (error) throw error;
    return (data ?? []) as CompanyInvoice[];
  };

  return useSWR(user?.id ? `invoices-${user.id}` : null, fetcher, {
    refreshInterval: 60_000,
  });
}
