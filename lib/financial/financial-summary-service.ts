import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import type { DateRange } from './date-range';
import { trendBucketFor } from './date-range';

export interface FinancialSummary {
  revenue: number;
  expenses: number;
  profit: number;
  revenueCount: number;
  expenseCount: number;
}

export interface FinancialTrendPoint {
  bucket: string;
  revenue: number;
  expenses: number;
}

export interface DrillDownInvoice {
  id: string;
  number: string;
  counterparty: string;
  date: string;
  amount: number;
}

export const DRILL_DOWN_LIMIT = 200;

const REVENUE_STATUSES = ['issued', 'sent_to_ksef', 'accepted'] as const;

function getClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function getSummary(range: DateRange): Promise<FinancialSummary> {
  const { data, error } = await getClient().rpc('get_financial_summary', {
    p_from: range.from,
    p_to: range.to,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const summary = {
    revenue: num(row?.revenue),
    expenses: num(row?.expenses),
    profit: num(row?.profit),
    revenueCount: num(row?.revenue_count),
    expenseCount: num(row?.expense_count),
  };
  console.debug('Financial Summary', { range, ...summary });
  return summary;
}

async function getTrend(range: DateRange): Promise<FinancialTrendPoint[]> {
  const { data, error } = await getClient().rpc('get_financial_trend', {
    p_from: range.from,
    p_to: range.to,
    p_bucket: trendBucketFor(range),
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    bucket: r.bucket,
    revenue: num(r.revenue),
    expenses: num(r.expenses),
  }));
}

async function getRevenueInvoices(range: DateRange): Promise<DrillDownInvoice[]> {
  const { data, error } = await getClient()
    .from('issued_invoices')
    .select('id, invoice_number, buyer_name, issue_date, gross_total')
    .in('status', [...REVENUE_STATUSES])
    .gte('issue_date', range.from)
    .lte('issue_date', range.to)
    .order('issue_date', { ascending: false })
    .limit(DRILL_DOWN_LIMIT);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    number: r.invoice_number ?? '',
    counterparty: r.buyer_name ?? '',
    date: r.issue_date,
    amount: num(r.gross_total),
  }));
}

async function getExpenseInvoices(range: DateRange): Promise<DrillDownInvoice[]> {
  const { data, error } = await getClient()
    .from('invoices')
    .select('id, invoice_number, seller_name, invoice_date, issue_date, total_amount')
    .or(
      `and(invoice_date.gte.${range.from},invoice_date.lte.${range.to}),` +
        `and(invoice_date.is.null,issue_date.gte.${range.from},issue_date.lte.${range.to})`
    )
    .order('invoice_date', { ascending: false, nullsFirst: false })
    .limit(DRILL_DOWN_LIMIT);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    number: r.invoice_number ?? '',
    counterparty: r.seller_name ?? '',
    date: r.invoice_date ?? r.issue_date ?? '',
    amount: num(r.total_amount),
  }));
}

export const financialSummaryService = {
  getSummary,
  getTrend,
  getRevenueInvoices,
  getExpenseInvoices,
};
