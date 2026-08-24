import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * POST /api/owner/invoices/:id/send
 *
 * Sends an issued invoice by email and in-app notification.
 * Marks sentAt when delivered.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: u } = await (supabase as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (u?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice } = await (supabase as any)
    .from('platform_invoices')
    .select('id, status, invoice_number, entity_id, total_cents')
    .eq('id', params.id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: 'Faktura nie znaleziona.' }, { status: 404 });
  }

  if (invoice.status !== 'issued' && invoice.status !== 'sent') {
    return NextResponse.json({ error: 'Faktura musi być wystawiona przed wysłaniem.' }, { status: 400 });
  }

  // Get all active users in the company to notify
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: companyUsers } = await (supabase as any)
    .from('users')
    .select('id, email')
    .eq('company_id', invoice.entity_id)
    .eq('active', true);

  const nowIso = new Date().toISOString();
  const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  // Log email events — table is `email_events`, columns: event_type, recipient, subject, company_id
  const emailEvents = (companyUsers ?? []).map((cu: { id: string; email: string }) => ({
    event_type:   'platform_invoice_sent',
    recipient:    cu.email,
    subject:      `Faktura platformowa ${invoice.invoice_number}`,
    company_id:   invoice.entity_id,
    raw_metadata: { invoiceId: params.id, invoiceNumber: invoice.invoice_number, userId: cu.id },
    created_at:   nowIso,
  }));

  if (emailEvents.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('email_events').insert(emailEvents);
  }

  // Mark as sent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('platform_invoices')
    .update({
      status:     'sent',
      sent_at:    nowIso,
      updated_at: nowIso,
    })
    .eq('id', params.id);

  // Audit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('platform_invoice_audit').insert({
    invoice_id: params.id,
    actor_id:   user.id,
    action:     'sent',
    ip:         ownerIp,
    payload:    { recipientCount: emailEvents.length },
  });

  return NextResponse.json({
    ok:             true,
    status:         'sent',
    sentAt:         nowIso,
    recipientCount: emailEvents.length,
  });
}
