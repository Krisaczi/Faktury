'use client';

import useSWR from 'swr';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

function getClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export interface DashboardMetrics {
  total_invoices_30d: number;
  high_risk_count: number;
  flagged_amount_sum: number;
}

export interface TimeseriesPoint {
  day: string;
  total: number;
  flagged: number;
}

export interface ActivityItem {
  id: string;
  kind: 'invoice' | 'flag' | 'upload';
  label: string;
  created_at: string;
}

async function fetchMetrics(): Promise<DashboardMetrics> {
  const supabase = getClient();
  const { data, error } = await supabase.rpc('get_dashboard_metrics');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    total_invoices_30d: Number(row?.total_invoices_30d ?? 0),
    high_risk_count: Number(row?.high_risk_count ?? 0),
    flagged_amount_sum: Number(row?.flagged_amount_sum ?? 0),
  };
}

async function fetchTimeseries(): Promise<TimeseriesPoint[]> {
  const supabase = getClient();
  const { data, error } = await supabase.rpc('get_invoice_timeseries');
  if (error) throw error;
  return (data ?? []).map((r: { day: string; total: number; flagged: number }) => ({
    day: r.day,
    total: Number(r.total),
    flagged: Number(r.flagged),
  }));
}

async function fetchActivity(): Promise<ActivityItem[]> {
  const supabase = getClient();
  const { data, error } = await supabase.rpc('get_recent_activity');
  if (error) throw error;
  return (data ?? []) as ActivityItem[];
}

export function useDashboardMetrics() {
  return useSWR<DashboardMetrics>('dashboard-metrics', fetchMetrics, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}

export function useDashboardTimeseries() {
  return useSWR<TimeseriesPoint[]>('dashboard-timeseries', fetchTimeseries, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}

export function useDashboardActivity() {
  return useSWR<ActivityItem[]>('dashboard-activity', fetchActivity, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
}
