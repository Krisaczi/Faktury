'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';

export interface CustomerAuditEntry {
  id:            string;
  event_type:    'created' | 'validation_failed' | 'duplicate_blocked';
  customer_name: string | null;
  customer_nip:  string | null;
  error_detail:  string | null;
  created_at:    string;
  user_email:    string | null;
}

export interface CustomerAuditResult {
  rows:       CustomerAuditEntry[];
  totalCount: number;
}

interface AdminContext {
  user:      { id: string; email: string };
  companyId: string;
  role:      string;
  // eslint-disable-next-line @typescript/no-explicit-any
  supabase:  any;
}

async function requireAdmin(): Promise<AdminContext> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: u } = await supabase
    .from('users')
    .select('role, company_id, email')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) throw new Error('No company');
  if (!['owner'].includes(u.role ?? 'accountant')) {
    throw new Error('Access denied — owner only');
  }

  return {
    user:      { id: user.id, email: u.email ?? user.email ?? '' },
    companyId: u.company_id as string,
    role:      u.role ?? 'accountant',
    supabase,
  };
}

export async function getCustomerAuditEvents(limit = 50): Promise<CustomerAuditResult> {
  const { supabase, companyId } = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any)
    .from('customer_audit_log')
    .select(`
      id,
      event_type,
      customer_name,
      customer_nip,
      error_detail,
      created_at,
      user_id
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { rows: [], totalCount: 0 };
  }

  // Fetch user emails
  const userIds = (rows ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean);
  let userEmailMap: Record<string, string> = {};

  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, email')
      .in('id', userIds);

    userEmailMap = Object.fromEntries(
      (users ?? []).map((u: { id: string; email: string }) => [u.id, u.email]),
    );
  }

  const enriched: CustomerAuditEntry[] = (rows ?? []).map((r: {
    id: string;
    event_type: 'created' | 'validation_failed' | 'duplicate_blocked';
    customer_name: string | null;
    customer_nip: string | null;
    error_detail: string | null;
    created_at: string;
    user_id: string;
  }) => ({
    id:            r.id,
    event_type:    r.event_type,
    customer_name: r.customer_name,
    customer_nip:  r.customer_nip,
    error_detail:  r.error_detail,
    created_at:    r.created_at,
    user_email:    userEmailMap[r.user_id] ?? null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supabase as any)
    .from('customer_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);

  return { rows: enriched, totalCount: count ?? 0 };
}
