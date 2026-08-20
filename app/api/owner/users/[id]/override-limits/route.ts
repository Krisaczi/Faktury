import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const OverrideSchema = z.object({
  extraUsers:    z.number().int().min(0).optional(),
  extraInvoices: z.number().int().min(0).optional(),
  extraVendors:  z.number().int().min(0).optional(),
  expiresAt:     z.string().datetime().nullable().optional(),
  reason:        z.string().max(500).optional(),
});

// POST /api/owner/users/:id/override-limits
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
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (u?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = OverrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { extraUsers, extraInvoices, extraVendors, expiresAt, reason } = parsed.data;

  if (extraUsers === undefined && extraInvoices === undefined && extraVendors === undefined) {
    return NextResponse.json({ error: 'At least one override field is required' }, { status: 400 });
  }

  // Get target user's company
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targetUser } = await (supabase as any)
    .from('users')
    .select('company_id, email')
    .eq('id', params.id)
    .maybeSingle();

  if (!targetUser?.company_id) {
    return NextResponse.json({ error: 'User has no company' }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Insert usage_overrides row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: overrideErr } = await (supabase as any)
    .from('usage_overrides')
    .insert({
      company_id:     targetUser.company_id,
      granted_by:     user.id,
      extra_users:    extraUsers ?? 0,
      extra_invoices: extraInvoices ?? 0,
      extra_vendors:  extraVendors ?? 0,
      expires_at:     expiresAt ?? null,
      reason:         reason ?? null,
      active:         true,
      created_at:     now,
    });

  if (overrideErr) {
    // Check if table exists with different schema
    return NextResponse.json({ error: 'Failed to create override: ' + overrideErr.message }, { status: 500 });
  }

  // If extraInvoices is set, also insert into invoice_usage_overrides for the existing enforcement
  if (extraInvoices && extraInvoices > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('invoice_usage_overrides')
      .insert({
        company_id:     targetUser.company_id,
        granted_by:     user.id,
        extra_invoices: extraInvoices,
        reason:         reason ?? 'Owner override',
        expires_at:     expiresAt ?? null,
        active:         true,
        consumed:       0,
      });
  }

  // Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('plan_change_audit')
    .insert({
      owner_id:       user.id,
      target_user_id: params.id,
      company_id:     targetUser.company_id,
      from_plan:      null,
      to_plan:        null,
      effective:      'now',
      reason:         reason ?? 'Owner override-limits',
      owner_ip:       req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      provider:       'owner',
    });

  return NextResponse.json({
    ok:      true,
    userId:  params.id,
    message: 'Override granted successfully.',
  });
}
