import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getCompanyPackage } from '@/lib/packages/get-company-package';
import { canManageCustomers } from '@/lib/permissions';

// ─── GET /api/customers?search=&page=&limit=&sort= ────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: u } = await supabase
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) return NextResponse.json({ error: 'No company' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('search') ?? '').trim();
  const page   = Math.max(parseInt(searchParams.get('page')   ?? '1', 10) || 1, 1);
  const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '20', 10) || 20, 100);
  const sort   = (searchParams.get('sort') ?? 'recent').trim();

  const offset = (page - 1) * limit;

  // Determine sort order
  let orderCol: string   = 'last_used_at';
  let ascending: boolean = false;

  if (sort === 'name') {
    orderCol = 'name';
    ascending = true;
  } else if (sort === 'createdAt') {
    orderCol = 'created_at';
    ascending = false;
  } else if (sort === 'recent') {
    orderCol = 'last_used_at';
    ascending = false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('buyer_companies')
    .select('id, name, nip, street, postal_code, city, country, email, phone, billing_email, last_used_at, created_at, deleted_at', { count: 'exact' })
    .eq('company_id', u.company_id)
    .is('deleted_at', null);

  if (search.length > 0) {
    query = query.or(`name.ilike.%${search}%,nip.ilike.%${search}%`);
  }

  // For "recent" sort, also do a secondary sort by name
  if (sort === 'recent') {
    query = query.order('last_used_at', { ascending: false, nullsFirst: false })
                 .order('name', { ascending: true });
  } else {
    query = query.order(orderCol, { ascending });
  }

  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const total   = count ?? 0;
  const hasNext = offset + limit < total;
  const hasPrev = page > 1;

  return NextResponse.json({
    customers: data ?? [],
    pagination: { page, limit, total, hasNext, hasPrev },
  });
}

// ─── POST /api/customers ──────────────────────────────────────────────────────

const CreateCustomerSchema = z.object({
  name:    z.string().min(1, 'Nazwa firmy jest wymagana').max(200),
  nip:     z.string().regex(/^\d{10}$/, 'NIP musi zawierać 10 cyfr'),
  address: z.string().min(3, 'Adres jest wymagany (min. 3 znaki)').max(500),
  email:   z.string().email('Nieprawidłowy e-mail').optional().or(z.literal('')),
  phone:   z.string().max(50).optional().or(z.literal('')),
});

async function requireCustomerAccess(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>, userId: string) {
  const { data: u } = await supabase
    .from('users')
    .select('company_id, role')
    .eq('id', userId)
    .maybeSingle();

  if (!u?.company_id) return { error: 'No company', status: 403, user: null, companyId: null, role: null };
  if (!['owner', 'accountant'].includes(u.role ?? 'accountant')) {
    return { error: 'Brak uprawnień.', status: 403, user: null, companyId: null, role: null };
  }

  const pkg = await getCompanyPackage(u.company_id);
  const allowed = canManageCustomers(u.role, pkg.type);
  if (!allowed) {
    return { error: 'Zarządzanie klientami jest dostępne tylko w planie Professional.', status: 403, user: null, companyId: null, role: null };
  }

  return { error: null, status: 200, user: { id: userId }, companyId: u.company_id, role: u.role };
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await requireCustomerAccess(supabase, user.id);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const companyId = access.companyId!;

  const body = await req.json().catch(() => ({}));
  const parsed = CreateCustomerSchema.safeParse(body);

  if (!parsed.success) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('customer_audit_log').insert({
      company_id:    companyId,
      user_id:       user.id,
      event_type:    'validation_failed',
      customer_name: body.name ?? null,
      customer_nip:  body.nip ?? null,
      error_detail:  JSON.stringify(parsed.error.flatten().fieldErrors),
    });

    return NextResponse.json({
      error: 'Błąd walidacji',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }, { status: 400 });
  }

  const { name, nip, address, email, phone } = parsed.data;

  // Parse address into street / postal_code / city (best effort)
  const addressParts = address.split(',').map((s) => s.trim());
  const street = addressParts[0] || address;
  const postalCity = addressParts.slice(1).join(', ').trim() || null;
  const postalMatch = postalCity?.match(/(\d{2}-\d{3})/);
  const postalCode = postalMatch?.[1] ?? null;
  const city = postalCity?.replace(/\d{2}-\d{3}\s*/, '').trim() || postalCity || null;

  // Check for duplicate NIP
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('buyer_companies')
    .select('id')
    .eq('company_id', companyId)
    .eq('nip', nip)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('customer_audit_log').insert({
      company_id:    companyId,
      user_id:       user.id,
      event_type:    'duplicate_blocked',
      customer_name: name,
      customer_nip:  nip,
      error_detail:  'Klient z tym numerem NIP już istnieje.',
    });

    return NextResponse.json({
      error: 'Klient z tym numerem NIP już istnieje w bazie.',
    }, { status: 409 });
  }

  const newId = crypto.randomUUID();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created, error: insertErr } = await (supabase as any)
    .from('buyer_companies')
    .insert({
      id:         newId,
      company_id: companyId,
      owner_id:   user.id,
      name,
      nip,
      street,
      postal_code: postalCode,
      city,
      country:    'Polska',
      email:      email || null,
      phone:      phone || null,
    })
    .select('id, name, nip, street, postal_code, city, country, email, phone, billing_email, last_used_at, created_at')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('customer_audit_log').insert({
        company_id:    companyId,
        user_id:       user.id,
        event_type:    'duplicate_blocked',
        customer_name: name,
        customer_nip:  nip,
        error_detail:  'Klient z tym numerem NIP już istnieje (DB constraint).',
      });

      return NextResponse.json({
        error: 'Klient z tym numerem NIP już istnieje w bazie.',
      }, { status: 409 });
    }

    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('customer_audit_log').insert({
    company_id:    companyId,
    user_id:       user.id,
    event_type:    'created',
    customer_name: name,
    customer_nip:  nip,
  });

  return NextResponse.json({ customer: created }, { status: 201 });
}
