import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const updateSchema = z.object({
  name:     z.string().min(2, 'Company name must be at least 2 characters').max(200).optional(),
  nip:      z.string().max(20).optional().nullable(),
  currency: z.enum(['PLN', 'EUR', 'USD', 'GBP', 'CZK', 'HUF']).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userRecord } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) {
      return NextResponse.json({ error: 'No company found' }, { status: 404 });
    }

    // Only owner or admin can update company info
    if (!['owner', 'admin'].includes(userRecord.role ?? '')) {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.name     !== undefined) updates.name     = parsed.data.name;
    if (parsed.data.nip      !== undefined) updates.nip      = parsed.data.nip;
    if (parsed.data.currency !== undefined) updates.currency = parsed.data.currency;

    const { data: company, error } = await supabase
      .from('companies')
      .update(updates as never)
      .eq('id', userRecord.company_id)
      .select('id, name, nip, currency, ingestion_email, subscription_status, updated_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    await supabase.from('settings_audit').insert({
      company_id: userRecord.company_id,
      user_id:    user.id,
      action:     'company_info_updated',
      metadata:   { fields: Object.keys(parsed.data) },
    });

    return NextResponse.json({ company });
  } catch (err) {
    console.error('[api/companies/update]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
