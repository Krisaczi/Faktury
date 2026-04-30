'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';

export interface RiskFlag {
  id: string;
  invoice_id: string;
  type: string;
  severity: string;
  message: string;
  created_at: string;
}

export interface InvoiceDetail {
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
  xml_raw: string;
  overall_risk: string;
  seller_nip: string;
  buyer_nip: string;
  seller_name: string;
  created_at: string;
  updated_at: string;
  company_vendors: {
    id: string;
    name: string;
    nip: string;
    bank_accounts: string[];
    avg_amount: number;
  } | null;
  risk_flags: RiskFlag[];
}

export function useInvoiceDetail(id: string | null) {
  const supabase = createClient();

  const fetcher = async (): Promise<InvoiceDetail> => {
    const { data, error } = await supabase
      .from('company_invoices')
      .select('*, company_vendors(id, name, nip, bank_accounts, avg_amount), risk_flags(*)')
      .eq('id', id!)
      .maybeSingle();

    if (error) throw new Error(error.message ?? 'Failed to fetch invoice');
    if (!data) throw new Error('Invoice not found');
    return data as InvoiceDetail;
  };

  return useSWR(id ? `invoice-detail-${id}` : null, fetcher);
}
