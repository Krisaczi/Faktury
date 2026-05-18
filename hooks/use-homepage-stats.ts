'use client';

import useSWR from 'swr';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface HomepageStats {
  total_companies: number;
  total_vendors: number;
  avg_report_time_minutes: number;
  flagged_invoices_count: number;
}

const FALLBACK: HomepageStats = {
  total_companies: 500,
  total_vendors: 2_000_000,
  avg_report_time_minutes: 1.5,
  flagged_invoices_count: 0,
};

function formatCompanies(n: number): string {
  if (n >= 1000) return `${Math.floor(n / 1000)}k+`;
  if (n >= 100)  return `${Math.floor(n / 100) * 100}+`;
  if (n >= 10)   return `${Math.floor(n / 10) * 10}+`;
  return `${n}+`;
}

function formatVendors(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M+`;
  if (n >= 1_000)     return `${Math.floor(n / 1_000)}k+`;
  return `${n}+`;
}

function formatReportTime(mins: number): string {
  if (mins < 1)  return '<1min';
  if (mins < 2)  return '<2min';
  if (mins < 60) return `<${Math.ceil(mins)}min`;
  return `<${Math.ceil(mins / 60)}hr`;
}

export function formatPolishShortNumber(n: number): string {
  if (n < 1_000)       return n.toString();
  if (n < 1_000_000)   return `${(n / 1_000).toFixed(1).replace('.', ',')} tys.`;
  return `${(n / 1_000_000).toFixed(1).replace('.', ',')} mln`;
}

export interface FormattedHomepageStats {
  enterprises: string;
  vendors: string;
  flaggedInvoices: string;
  reportTime: string;
}

function format(raw: HomepageStats): FormattedHomepageStats {
  return {
    enterprises:     formatCompanies(raw.total_companies),
    vendors:         formatVendors(raw.total_vendors),
    flaggedInvoices: formatPolishShortNumber(raw.flagged_invoices_count),
    reportTime:      formatReportTime(raw.avg_report_time_minutes),
  };
}

async function fetchStats(): Promise<HomepageStats> {
  const { data, error } = await supabase.rpc('get_homepage_stats');
  if (error) throw error;
  return data as HomepageStats;
}

export function useHomepageStats() {
  const { data, error, isLoading } = useSWR<HomepageStats>(
    'homepage-stats',
    fetchStats,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60 * 60 * 1000, // 1 hour
      refreshInterval:  60 * 60 * 1000, // re-fetch every hour
    }
  );

  const stats = format(data ?? FALLBACK);

  return {
    stats,
    isLoading,
    isError: !!error,
  };
}
