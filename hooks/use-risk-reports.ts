import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import type { RiskReport } from '@/types';

export function useRiskReports() {
  const supabase = createClient();

  const fetcher = async () => {
    const { data, error } = await supabase
      .from('risk_reports')
      .select('*, vendors(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as (RiskReport & { vendors: { name: string } | null })[];
  };

  return useSWR('risk_reports', fetcher);
}
