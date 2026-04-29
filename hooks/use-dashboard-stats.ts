'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/auth-provider';

export interface DailyBucket {
  date: string;
  total: number;
  flagged: number;
}

export interface DashboardStats {
  totalInvoices: number;
  highRiskCount: number;
  estimatedSaved: number;
  chartData: DailyBucket[];
  companyId: string | null;
}

const RISK_SAVING_PER_FLAG = 2500;

export function useDashboardStats() {
  const { user } = useAuth();
  const supabase = createClient();

  const fetcher = async (): Promise<DashboardStats> => {
    if (!user?.id) {
      return { totalInvoices: 0, highRiskCount: 0, estimatedSaved: 0, chartData: [], companyId: null };
    }

    const { data: userRow } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    const companyId = userRow?.company_id ?? null;
    if (!companyId) {
      return { totalInvoices: 0, highRiskCount: 0, estimatedSaved: 0, chartData: [], companyId: null };
    }

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceISO = since.toISOString();

    const { data: invoices } = await supabase
      .from('company_invoices')
      .select('id, overall_risk, created_at')
      .eq('company_id', companyId)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: true });

    const rows = invoices ?? [];

    const totalInvoices = rows.length;
    const highRiskCount = rows.filter((r) => r.overall_risk === 'high').length;
    const estimatedSaved = highRiskCount * RISK_SAVING_PER_FLAG;

    const buckets: Record<string, { total: number; flagged: number }> = {};
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { total: 0, flagged: 0 };
    }

    for (const row of rows) {
      const key = row.created_at.slice(0, 10);
      if (buckets[key]) {
        buckets[key].total += 1;
        if (row.overall_risk === 'high' || row.overall_risk === 'medium') {
          buckets[key].flagged += 1;
        }
      }
    }

    const chartData: DailyBucket[] = Object.entries(buckets).map(([date, v]) => ({
      date,
      ...v,
    }));

    return { totalInvoices, highRiskCount, estimatedSaved, chartData, companyId };
  };

  return useSWR(user?.id ? `dashboard-stats-${user.id}` : null, fetcher, {
    refreshInterval: 30_000,
  });
}
