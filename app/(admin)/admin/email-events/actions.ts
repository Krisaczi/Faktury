'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/permissions';

export interface EmailEvent {
  id:                string;
  event_type:        'received' | 'rejected' | 'processed' | 'error';
  sender:            string | null;
  recipient:         string | null;
  subject:           string | null;
  provider:          string | null;
  status_code:       number | null;
  company_id:        string | null;
  upload_session_id: string | null;
  attachments_count: number;
  files_processed:   number;
  error_message:     string | null;
  raw_metadata:      Record<string, unknown>;
  created_at:        string;
}

export interface ActionResult<T> {
  ok:     boolean;
  data?:  T;
  error?: string;
}

async function requireAdmin() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: u } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) throw new Error('Brak przypisanej firmy.');
  if (!['owner'].includes(u.role ?? '')) {
    throw new Error('Tylko administrator może ogladać zdarzenia e-mail.');
  }

  return { user, companyId: u.company_id as string, role: u.role as AppRole, supabase };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getEmailEvents(limit = 20): Promise<{ rows: EmailEvent[]; totalCount: number }> {
  const { supabase } = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, count, error } = await (supabase as any)
    .from('email_events')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return { rows: (data ?? []) as EmailEvent[], totalCount: count ?? 0 };
}
