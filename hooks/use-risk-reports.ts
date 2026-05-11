'use client';

import useSWR from 'swr';
import { useCallback, useState } from 'react';

export interface RiskReportFilters {
  from?: string;
  to?: string;
  vendorId?: string;
  riskLevel?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'issue_date' | 'amount';
  sortDir?: 'asc' | 'desc';
}

export interface RiskFlag {
  type: string;
  severity: string;
  message: string;
}

export interface RiskReportRow {
  id: string;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  amount: number | null;
  currency: string;
  overall_risk: 'low' | 'medium' | 'high' | 'critical' | null;
  vendor_id: string | null;
  vendor_name: string | null;
  seller_nip: string | null;
  bank_account: string | null;
  raw_file_url: string | null;
  flag_count: number;
  flags: RiskFlag[];
}

export interface RiskReportResponse {
  rows: RiskReportRow[];
  totalCount: number;
  highRiskCount: number;
  totalFlaggedAmount: number;
  page: number;
  pageSize: number;
}

export interface FilterOptions {
  vendors: { id: string; name: string }[];
  riskLevels: string[];
}

function buildUrl(filters: RiskReportFilters): string {
  const params = new URLSearchParams();
  if (filters.from)      params.set('from',      filters.from);
  if (filters.to)        params.set('to',         filters.to);
  if (filters.vendorId)  params.set('vendorId',   filters.vendorId);
  if (filters.riskLevel) params.set('riskLevel',  filters.riskLevel);
  if (filters.search)    params.set('search',     filters.search);
  params.set('page',     String(filters.page     ?? 1));
  params.set('pageSize', String(filters.pageSize ?? 20));
  if (filters.sortBy)    params.set('sortBy',     filters.sortBy);
  if (filters.sortDir)   params.set('sortDir',    filters.sortDir);
  return `/api/reports/risk?${params}`;
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}

export function useRiskReport(filters: RiskReportFilters) {
  return useSWR<RiskReportResponse>(
    buildUrl(filters),
    fetcher as (url: string) => Promise<RiskReportResponse>,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
    }
  );
}

export function useRiskFilters() {
  return useSWR<FilterOptions>(
    '/api/reports/risk/filters',
    fetcher as (url: string) => Promise<FilterOptions>,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    }
  );
}

export function useExportCsv() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportCsv = useCallback(async (
    filters: Omit<RiskReportFilters, 'page' | 'pageSize' | 'sortBy' | 'sortDir'>
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reports/risk/export-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error?: string }).error ?? 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `risk-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  }, []);

  return { exportCsv, loading, error };
}
