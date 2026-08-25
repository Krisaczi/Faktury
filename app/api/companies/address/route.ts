import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const POSTAL_PATTERNS: Record<string, RegExp> = {
  PL: /^\d{2}-\d{3}$/,
  DE: /^\d{5}$/,
  FR: /^\d{5}$/,
  GB: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/,
  US: /^\d{5}(-\d{4})?$/,
  CZ: /^\d{3}\s?\d{2}$/,
  HU: /^\d{4}$/,
};

const addressSchema = z.object({
  addressLine1: z.string().min(1, 'Adres jest wymagany').max(200),
  addressLine2: z.string().max(200).optional().or(z.literal('')),
  city:         z.string().min(1, 'Miasto jest wymagane').max(100),
  postalCode:   z.string().min(1, 'Kod pocztowy jest wymagany').max(20),
  stateRegion:  z.string().max(100).optional().or(z.literal('')),
  country:      z.string().min(2, 'Kraj jest wymagany').max(2),
  vatId:        z.string().max(20).optional().or(z.literal('')),
}).superRefine((val, ctx) => {
  const pattern = POSTAL_PATTERNS[val.country];
  if (pattern && !pattern.test(val.postalCode)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['postalCode'],
      message: `Nieprawidłowy kod pocztowy dla kraju ${val.country}`,
    });
  }
});

/**
 * GET /api/companies/address
 * Returns the current company's address fields and edit policy.
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

  const { data: company, error } = await supabase
    .from('companies')
    .select('id, street, address_line2, city, zip, state_region, country, nip, address_edit_policy, address_locked, updated_at')
    .eq('id', userRecord.company_id)
    .maybeSingle();

  if (error || !company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const { data: lastAudit } = await supabase
    .from('company_address_audit')
    .select('changed_by, created_at')
    .eq('company_id', userRecord.company_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let updatedByName: string | null = null;
  if (lastAudit?.changed_by) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', lastAudit.changed_by)
      .maybeSingle();
    updatedByName = profile?.full_name ?? null;
  }

  return NextResponse.json({
    address: {
      addressLine1:  company.street ?? '',
      addressLine2:  company.address_line2 ?? '',
      city:          company.city ?? '',
      postalCode:    company.zip ?? '',
      stateRegion:   company.state_region ?? '',
      country:       company.country ?? 'PL',
      vatId:         company.nip ?? '',
    },
    meta: {
      editPolicy:       company.address_edit_policy ?? 'members',
      locked:           company.address_locked ?? false,
      updatedAt:        company.updated_at,
      updatedBy:        lastAudit?.changed_by ?? null,
      updatedByName,
      updatedAtAudit:   lastAudit?.created_at ?? null,
    },
    role: userRecord.role,
  });
}

/**
 * PUT /api/companies/address
 * Updates the company's address. Enforces edit policy and rate limit.
 */
export async function PUT(req: NextRequest) {
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

  const role = userRecord.role ?? 'accountant';

  const { data: company } = await supabase
    .from('companies')
    .select('street, address_line2, city, zip, state_region, country, nip, address_edit_policy, address_locked')
    .eq('id', userRecord.company_id)
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  if (company.address_locked) {
    return NextResponse.json({ error: 'Edycja adresu jest zablokowana przez właściciela platformy.' }, { status: 403 });
  }

  const policy = company.address_edit_policy ?? 'members';
  if (policy === 'admins' && role !== 'owner') {
    return NextResponse.json({ error: 'Tylko administrator może edytować adres.' }, { status: 403 });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('company_address_audit')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', userRecord.company_id)
    .eq('change_type', 'update')
    .gte('created_at', oneHourAgo);

  if ((count ?? 0) >= 5) {
    return NextResponse.json({ error: 'Zbyt wiele aktualizacji adresu. Spróbuj ponownie za godzinę.' }, { status: 429 });
  }

  const body = await req.json();
  const parsed = addressSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Błąd walidacji', issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const before = {
    addressLine1: company.street ?? '',
    addressLine2: company.address_line2 ?? '',
    city:         company.city ?? '',
    postalCode:   company.zip ?? '',
    stateRegion:  company.state_region ?? '',
    country:      company.country ?? 'PL',
    vatId:        company.nip ?? '',
  };

  const after = {
    addressLine1: parsed.data.addressLine1,
    addressLine2: parsed.data.addressLine2 ?? '',
    city:         parsed.data.city,
    postalCode:   parsed.data.postalCode,
    stateRegion:  parsed.data.stateRegion ?? '',
    country:      parsed.data.country,
    vatId:        parsed.data.vatId ?? '',
  };

  const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const nowIso = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from('companies')
    .update({
      street:        after.addressLine1,
      address_line2: after.addressLine2 || null,
      city:          after.city,
      zip:           after.postalCode,
      state_region:  after.stateRegion || null,
      country:       after.country,
      nip:           after.vatId || undefined,
      updated_at:    nowIso,
    })
    .eq('id', userRecord.company_id);

  if (updateErr) {
    console.error('[address] update error', updateErr);
    return NextResponse.json({ error: 'Błąd zapisu adresu.' }, { status: 500 });
  }

  await supabase.from('company_address_audit').insert({
    company_id:  userRecord.company_id,
    changed_by:  user.id,
    change_type: 'update',
    before:      before,
    after:       after,
    ip:          ownerIp,
  });

  await supabase.from('settings_audit').insert({
    company_id: userRecord.company_id,
    user_id:    user.id,
    action:     'company_address_updated',
    metadata:   { before, after },
  });

  return NextResponse.json({ ok: true, address: after });
}
