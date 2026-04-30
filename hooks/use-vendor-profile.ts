'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';

export interface VendorInvoice {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  issue_date: string | null;
  due_date: string | null;
  bank_account: string;
  ksef_reference: string;
  overall_risk: string;
  seller_nip: string;
  created_at: string;
}

export interface VendorProfile {
  id: string;
  company_id: string;
  name: string;
  nip: string;
  bank_accounts: string[];
  avg_amount: number;
  created_at: string;
  updated_at: string;
  invoices: VendorInvoice[];
  stats: {
    totalInvoices: number;
    avgAmount: number;
    highRiskCount: number;
    overallRisk: 'low' | 'medium' | 'high';
    riskTrend: { date: string; high: number; medium: number; low: number; total: number }[];
  };
}

function computeStats(invoices: VendorInvoice[]): VendorProfile['stats'] {
  const totalInvoices = invoices.length;
  const avgAmount = totalInvoices > 0 ? invoices.reduce((s, i) => s + i.amount, 0) / totalInvoices : 0;
  const highRiskCount = invoices.filter((i) => i.overall_risk === 'high').length;
  const medRiskCount = invoices.filter((i) => i.overall_risk === 'medium').length;

  let overallRisk: 'low' | 'medium' | 'high' = 'low';
  if (highRiskCount > 0) overallRisk = 'high';
  else if (medRiskCount > 0) overallRisk = 'medium';

  const buckets: Record<string, { high: number; medium: number; low: number; total: number }> = {};
  const sorted = [...invoices].sort((a, b) =>
    (a.issue_date ?? a.created_at).localeCompare(b.issue_date ?? b.created_at)
  );

  for (const inv of sorted) {
    const key = (inv.issue_date ?? inv.created_at).slice(0, 7);
    if (!buckets[key]) buckets[key] = { high: 0, medium: 0, low: 0, total: 0 };
    buckets[key].total += 1;
    const risk = inv.overall_risk?.toLowerCase() ?? 'low';
    if (risk === 'high') buckets[key].high += 1;
    else if (risk === 'medium') buckets[key].medium += 1;
    else buckets[key].low += 1;
  }

  const riskTrend = Object.entries(buckets).map(([date, v]) => ({ date, ...v }));

  return { totalInvoices, avgAmount, highRiskCount, overallRisk, riskTrend };
}

export function useVendorProfile(id: string | null) {
  const supabase = createClient();

  const fetcher = async (): Promise<VendorProfile> => {
    const [vendorRes, invoicesRes] = await Promise.all([
      supabase
        .from('company_vendors')
        .select('*')
        .eq('id', id!)
        .maybeSingle(),
      supabase
        .from('company_invoices')
        .select('id, invoice_number, amount, currency, issue_date, due_date, bank_account, ksef_reference, overall_risk, seller_nip, created_at')
        .eq('vendor_id', id!)
        .order('issue_date', { ascending: false, nullsFirst: false }),
    ]);

    if (vendorRes.error) throw new Error(vendorRes.error.message ?? 'Failed to fetch vendor');
    if (!vendorRes.data) throw new Error('Vendor not found');
    if (invoicesRes.error) throw new Error(invoicesRes.error.message ?? 'Failed to fetch invoices');

    const invoices = (invoicesRes.data ?? []) as VendorInvoice[];
    const stats = computeStats(invoices);

    return { ...(vendorRes.data as Omit<VendorProfile, 'invoices' | 'stats'>), invoices, stats };
  };

  return useSWR(id ? `vendor-profile-${id}` : null, fetcher);
}
