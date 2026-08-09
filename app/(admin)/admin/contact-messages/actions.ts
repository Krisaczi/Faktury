'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/permissions';

export interface ContactMessage {
  id:              string;
  company_id:      string | null;
  sender_name:     string;
  sender_email:    string;
  sender_phone:    string | null;
  subject:         string;
  message:         string;
  attachment_url:  string | null;
  attachment_meta: { filename: string; size: number; mime_type: string } | null;
  delivered:       boolean;
  delivered_at:    string | null;
  delivery_error:  string | null;
  ip_address:      string | null;
  user_agent:      string | null;
  created_at:      string;
  updated_at:      string;
  status:          'new' | 'read' | 'archived' | 'deleted';
}

export interface ActionResult<T> {
  ok:         boolean;
  data?:      T;
  error?:     string;
  fieldErrors?: Record<string, string[]>;
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
    throw new Error('Tylko administrator może zarządzać wiadomościami.');
  }

  return { user, companyId: u.company_id as string, role: u.role as AppRole, supabase };
}

// ─── LIST ─────────────────────────────────────────────────────────────────────

export async function getContactMessages(params: {
  page?: number;
  pageSize?: number;
  status?: 'all' | 'new' | 'read' | 'archived' | 'deleted';
  search?: string;
} = {}): Promise<{ rows: ContactMessage[]; totalCount: number }> {
  const { supabase, user } = await requireAdmin();
  const { page = 1, pageSize = 25, status = 'all', search } = params;

  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('contact_messages')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status !== 'all') {
    query = query.eq('status', status);
  } else {
    query = query.neq('status', 'deleted');
  }

  if (search) {
    query = query.or(
      `sender_name.ilike.%${search}%,sender_email.ilike.%${search}%,subject.ilike.%${search}%`
    );
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as ContactMessage[], totalCount: count ?? 0 };
}

// ─── GET BY ID ────────────────────────────────────────────────────────────────

export async function getContactMessageById(id: string): Promise<ContactMessage | null> {
  const { supabase } = await requireAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('contact_messages')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  return (data as ContactMessage | null) ?? null;
}

// ─── MARK AS READ ─────────────────────────────────────────────────────────────

export async function markContactMessageRead(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase, user } = await requireAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('contact_messages')
      .update({ status: 'read' })
      .eq('id', id);

    if (error) return { ok: false, error: error.message };

    // Audit log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('audit_logs').insert({
      action: 'contact_message_read',
      metadata: { message_id: id },
    });

    revalidatePath('/admin/contact-messages');
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── UPDATE STATUS ────────────────────────────────────────────────────────────

export async function updateContactMessageStatus(
  id: string,
  status: 'new' | 'read' | 'archived' | 'deleted'
): Promise<ActionResult<null>> {
  try {
    const { supabase, user } = await requireAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('contact_messages')
      .update({ status })
      .eq('id', id);

    if (error) return { ok: false, error: error.message };

    // Audit log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('audit_logs').insert({
      action: 'contact_message_status_change',
      metadata: { message_id: id, new_status: status },
    });

    revalidatePath('/admin/contact-messages');
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}

// ─── HARD DELETE (GDPR right-to-erasure) ──────────────────────────────────────

export async function deleteContactMessage(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase } = await requireAdmin();

    // Get attachment path before deleting
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: msg } = await (supabase as any)
      .from('contact_messages')
      .select('attachment_url')
      .eq('id', id)
      .maybeSingle();

    // Delete attachment from storage if exists
    if (msg?.attachment_url) {
      await supabase.storage.from('contact-attachments').remove([msg.attachment_url]);
    }

    // Hard delete the row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('contact_messages')
      .delete()
      .eq('id', id);

    if (error) return { ok: false, error: error.message };

    // Audit log (insert before the row is gone — but we already deleted it,
    // so insert with just the id reference)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('audit_logs').insert({
      action: 'contact_message_deleted',
      metadata: { message_id: id },
    });

    revalidatePath('/admin/contact-messages');
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nieznany błąd.' };
  }
}
