import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /api/owner/invoices/:id/tax-audit
 * Returns tax-related audit entries for a platform invoice.
 */
export async function GET(
  _req: NextRequest,
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

  const taxActions = [
    'tax_snapshot_created',
    'tax_rate_changed',
    'vat_number_set',
    'tax_override_used',
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: audit } = await (supabase as any)
    .from('platform_invoice_audit')
    .select('*')
    .eq('invoice_id', params.id)
    .in('action', taxActions)
    .order('created_at', { ascending: false });

  return NextResponse.json({
    entries: (audit ?? []).map((a: { id: string; actor_id: string; action: string; reason: string | null; ip: string | null; payload: unknown; created_at: string }) => ({
      id:        a.id,
      actorId:   a.actor_id,
      action:    a.action,
      reason:    a.reason,
      ip:        a.ip,
      payload:   a.payload,
      createdAt: a.created_at,
    })),
  });
}
