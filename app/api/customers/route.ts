import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

// ─── GET /api/customers?search=<query>&limit=<n> ──────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: u } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) return NextResponse.json({ error: 'No company' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('search') ?? '').trim();
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 50);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('buyer_companies')
    .select('id, name, nip, street, postal_code, city, country, email, phone, billing_email, last_used_at, deleted_at')
    .eq('company_id', u.company_id)
    .is('deleted_at', null)
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
    .limit(limit);

  if (search.length > 0) {
    query = query.or(`name.ilike.%${search}%,nip.ilike.%${search}%`);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ customers: data ?? [] });
}

// ─── POST /api/customers ──────────────────────────────────────────────────────

const CreateCustomerSchema = z.object({
  name:    z.string().min(1, 'Nazwa firmy jest wymagana').max(200),
  nip:     z.string().regex(/^\d{10}$/, 'NIP musi zawierać 10 cyfr'),
  address: z.string().min(3, 'Adres jest wymagany (min. 3 znaki)').max(500),
  email:   z.string().email('Nieprawidłowy e-mail').optional().or(z.literal('')),
  phone:   z.string().max(50).optional().or(z.literal('')),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: u } = await supabase
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) return NextResponse.json({ error: 'No company' }, { status: 403 });
  if (!['owner', 'accountant'].includes(u.role ?? 'accountant')) {
    return NextResponse.json({ error: 'Brak uprawnień do dodawania klientów.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = CreateCustomerSchema.safeParse(body);

  if (!parsed.success) {
    // Log validation failure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('customer_audit_log').insert({
      company_id:    u.company_id,
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
    .eq('company_id', u.company_id)
    .eq('nip', nip)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) {
    // Log duplicate attempt
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('customer_audit_log').insert({
      company_id:    u.company_id,
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
      company_id: u.company_id,
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
    .select('id, name, nip, street, postal_code, city, country, email, phone, billing_email, last_used_at')
    .single();

  if (insertErr) {
    // Check if it's a unique constraint violation
    if (insertErr.code === '23505') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('customer_audit_log').insert({
        company_id:    u.company_id,
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

  // Log successful creation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('customer_audit_log').insert({
    company_id:    u.company_id,
    user_id:       user.id,
    event_type:    'created',
    customer_name: name,
    customer_nip:  nip,
  });

  return NextResponse.json({ customer: created }, { status: 201 });
}
