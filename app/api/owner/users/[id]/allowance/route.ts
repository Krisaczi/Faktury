import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { grantInvoiceAllowance } from '@/lib/packages/invoice-limit';

export const dynamic = 'force-dynamic';

const AllowanceSchema = z.object({
  extraInvoices: z.number().int().min(1).max(100),
  reason:        z.string().optional(),
  expiresAt:     z.string().nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    // Verify caller is owner
    const { data: caller } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (caller?.role !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can grant allowances.' }, { status: 403 });
    }

    // Parse body
    const body = await req.json();
    const parsed = AllowanceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Find the target user's company
    const { data: targetUser } = await supabase
      .from('users')
      .select('company_id, email')
      .eq('id', params.id)
      .maybeSingle();

    if (!targetUser?.company_id) {
      return NextResponse.json({ error: 'Target user not found or has no company.' }, { status: 404 });
    }

    const result = await grantInvoiceAllowance({
      ownerId:       user.id,
      companyId:     targetUser.company_id,
      extraInvoices: parsed.data.extraInvoices,
      reason:        parsed.data.reason,
      expiresAt:     parsed.data.expiresAt ?? null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: `Przyznano ${parsed.data.extraInvoices} dodatkowych faktur.`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
