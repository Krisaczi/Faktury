import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /api/companies/address/history
 * Returns recent address change history. Owner/admin only.
 */
export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!userRecord?.company_id) {
    return NextResponse.json({ error: 'No company found' }, { status: 404 });
  }

  if (userRecord.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: history, error } = await supabase
    .from('company_address_audit')
    .select('id, changed_by, change_type, before, after, reason, ip, created_at')
    .eq('company_id', userRecord.company_id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
  }

  // Fetch names for changed_by users
  const userIds = Array.from(new Set((history ?? []).map((h: { changed_by: string }) => h.changed_by)));
  let nameMap: Map<string, string> = new Map();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);
    nameMap = new Map((profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? null] as [string, string]));
  }

  return NextResponse.json({
    history: (history ?? []).map((h: {
      id: string; changed_by: string; change_type: string;
      before: unknown; after: unknown; reason: string | null; ip: string | null; created_at: string;
    }) => ({
      id:          h.id,
      changedBy:   h.changed_by,
      changedByName: nameMap.get(h.changed_by) ?? null,
      changeType:  h.change_type,
      before:      h.before,
      after:       h.after,
      reason:      h.reason,
      ip:          h.ip,
      createdAt:   h.created_at,
    })),
  });
}

/**
 * POST /api/companies/address/history
 * Revert address to a previous state from an audit entry. Owner only.
 */
export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!userRecord?.company_id) {
    return NextResponse.json({ error: 'No company found' }, { status: 404 });
  }

  if (userRecord.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { auditId } = await req.json();
  if (typeof auditId !== 'string') {
    return NextResponse.json({ error: 'auditId required' }, { status: 422 });
  }

  // Fetch the audit entry to get the "before" snapshot
  const { data: auditEntry } = await supabase
    .from('company_address_audit')
    .select('before, after')
    .eq('id', auditId)
    .eq('company_id', userRecord.company_id)
    .maybeSingle();

  if (!auditEntry) {
    return NextResponse.json({ error: 'Audit entry not found' }, { status: 404 });
  }

  const target = auditEntry.before as {
    addressLine1: string; addressLine2: string; city: string;
    postalCode: string; stateRegion: string; country: string; vatId: string;
  };

  if (!target) {
    return NextResponse.json({ error: 'No before snapshot available' }, { status: 400 });
  }

  // Fetch current state for audit
  const { data: current } = await supabase
    .from('companies')
    .select('street, address_line2, city, zip, state_region, country, nip')
    .eq('id', userRecord.company_id)
    .maybeSingle();

  const before = {
    addressLine1: current?.street ?? '',
    addressLine2: current?.address_line2 ?? '',
    city:         current?.city ?? '',
    postalCode:   current?.zip ?? '',
    stateRegion:  current?.state_region ?? '',
    country:      current?.country ?? 'PL',
    vatId:        current?.nip ?? '',
  };

  const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const nowIso = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from('companies')
    .update({
      street:        target.addressLine1,
      address_line2: target.addressLine2 || null,
      city:          target.city,
      zip:           target.postalCode,
      state_region:  target.stateRegion || null,
      country:       target.country,
      nip:           target.vatId || undefined,
      updated_at:    nowIso,
    })
    .eq('id', userRecord.company_id);

  if (updateErr) {
    return NextResponse.json({ error: 'Błąd przywracania adresu.' }, { status: 500 });
  }

  await supabase.from('company_address_audit').insert({
    company_id:  userRecord.company_id,
    changed_by:  user.id,
    change_type: 'revert',
    before:      before,
    after:       target,
    reason:      `Reverted to state from audit entry ${auditId}`,
    ip:          ownerIp,
  });

  return NextResponse.json({ ok: true, address: target });
}
