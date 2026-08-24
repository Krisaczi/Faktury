import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * POST /api/owner/invoices/:id/revoke
 *
 * Revokes/cancels an issued or sent invoice. Creates a reversal audit entry.
 * Uses service client for platform invoice access.
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
    .select('id, status, invoice_number')
    .eq('id', params.id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: 'Faktura nie znaleziona.' }, { status: 404 });
  }

  if (invoice.status === 'revoked') {
    return NextResponse.json({ error: 'Faktura jest już cofnięta.' }, { status: 400 });
  }

  if (invoice.status === 'draft') {
    return NextResponse.json({ error: 'Szkic nie może być cofnięty — usuń go.' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({} as { reason?: string }));
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null;

  const nowIso = new Date().toISOString();
  const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (svc as any)
    .from('platform_invoices')
    .update({
      status:     'revoked',
      updated_at: nowIso,
    })
    .eq('id', params.id);

  if (updateErr) {
    console.error('[revoke] update error', updateErr);
    return NextResponse.json({ error: 'Błąd cofania faktury.' }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (svc as any).from('platform_invoice_audit').insert({
    invoice_id: params.id,
    actor_id:   user.id,
    action:     'revoked',
    reason:     reason ?? undefined,
    ip:         ownerIp,
    payload:    { previousStatus: invoice.status, invoiceNumber: invoice.invoice_number },
  });

  return NextResponse.json({
    ok:     true,
    status: 'revoked',
  });
}
