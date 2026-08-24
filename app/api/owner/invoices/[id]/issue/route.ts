import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * POST /api/owner/invoices/:id/issue
 *
 * Finalizes a draft invoice: assigns invoice number, sets status=issued,
 * records issuedBy/issuedAt/dueDate, creates audit entry.
 * Uses service client for cross-company platform invoice access.
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

  const svc = getSupabaseServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice } = await (svc as any)
    .from('platform_invoices')
    .select('id, status, entity_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: 'Faktura nie znaleziona.' }, { status: 404 });
  }

  if (invoice.status !== 'draft') {
    return NextResponse.json({ error: 'Faktura nie jest szkicem.' }, { status: 400 });
  }

  // Generate invoice number via RPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoiceNumber, error: numErr } = await (svc as any)
    .rpc('generate_platform_invoice_number');

  if (numErr || !invoiceNumber) {
    console.error('[issue] number generation error', numErr);
    return NextResponse.json({ error: 'Błąd generowania numeru faktury.' }, { status: 500 });
  }

  const now = new Date();
  const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (svc as any)
    .from('platform_invoices')
    .update({
      invoice_number: invoiceNumber,
      status:         'issued',
      issued_by:      user.id,
      issued_at:      nowIso,
      due_date:       dueDate.toISOString().split('T')[0],
      updated_at:     nowIso,
    })
    .eq('id', params.id);

  if (updateErr) {
    console.error('[issue] update error', updateErr);
    return NextResponse.json({ error: 'Błąd wystawiania faktury.' }, { status: 500 });
  }

  const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (svc as any).from('platform_invoice_audit').insert({
    invoice_id: params.id,
    actor_id:   user.id,
    action:     'issued',
    ip:         ownerIp,
    payload:    { invoiceNumber, dueDate: dueDate.toISOString().split('T')[0] },
  });

  return NextResponse.json({
    ok:            true,
    invoiceNumber,
    status:        'issued',
    issuedAt:      nowIso,
    dueDate:       dueDate.toISOString().split('T')[0],
  });
}
