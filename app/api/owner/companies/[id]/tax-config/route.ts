import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /api/owner/companies/:id/tax-config
 * Returns company default VAT rate, VAT number, and tax policy.
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: config } = await (supabase as any)
    .from('company_tax_config')
    .select('default_vat_rate, default_vat_number, tax_policy, updated_at')
    .eq('company_id', params.id)
    .maybeSingle();

  return NextResponse.json({
    companyId:         params.id,
    defaultVatRate:    config?.default_vat_rate ?? null,
    defaultVatNumber:  config?.default_vat_number ?? null,
    taxPolicy:         config?.tax_policy ?? 'allow',
    updatedAt:         config?.updated_at ?? null,
  });
}

const UpdateSchema = z.object({
  defaultVatRate:   z.number().min(0).max(100).nullable().optional(),
  defaultVatNumber: z.string().max(30).nullable().optional(),
  taxPolicy:        z.enum(['allow', 'owner_only', 'disabled']).optional(),
});

/**
 * POST /api/owner/companies/:id/tax-config
 * Owner-only endpoint to set default VAT rate and VAT number.
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

  const body = await req.json().catch(() => ({}));
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Błąd walidacji', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();
  const updateData: Record<string, unknown> = { updated_at: nowIso };
  if (parsed.data.defaultVatRate !== undefined) updateData.default_vat_rate = parsed.data.defaultVatRate;
  if (parsed.data.defaultVatNumber !== undefined) updateData.default_vat_number = parsed.data.defaultVatNumber;
  if (parsed.data.taxPolicy !== undefined) updateData.tax_policy = parsed.data.taxPolicy;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('company_tax_config')
    .select('company_id')
    .eq('company_id', params.id)
    .maybeSingle();

  let dbErr;
  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (supabase as any).from('company_tax_config').update(updateData).eq('company_id', params.id);
    dbErr = r.error;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (supabase as any).from('company_tax_config').insert({
      company_id:         params.id,
      ...updateData,
    });
    dbErr = r.error;
  }

  if (dbErr) {
    return NextResponse.json({ error: 'Błąd zapisu konfiguracji.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
