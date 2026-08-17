import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getCompanyPackage } from '@/lib/packages/get-company-package';
import { canManageCustomers } from '@/lib/permissions';

const ZIP_REGEX = /^\d{2}-\d{3}$/;

const UpdateCustomerSchema = z.object({
  name:    z.string().min(1, 'Nazwa firmy jest wymagana').max(200),
  nip:     z.string().regex(/^\d{10}$/, 'NIP musi zawierać 10 cyfr'),
  address: z.string().min(3, 'Adres jest wymagany (min. 3 znaki)').max(500),
  zip:     z.string().regex(ZIP_REGEX, 'Kod pocztowy musi mieć format XX-XXX'),
  email:   z.string().email('Nieprawidłowy e-mail').optional().or(z.literal('')),
  phone:   z.string().max(50).optional().or(z.literal('')),
});

// ─── PUT /api/customers/:id ───────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: u } = await supabase
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) return NextResponse.json({ error: 'No company' }, { status: 403 });

  const pkg = await getCompanyPackage(u.company_id);
  if (!canManageCustomers(u.role, pkg.type)) {
    return NextResponse.json({ error: 'Zarządzanie klientami jest dostępne tylko w planie Professional.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = UpdateCustomerSchema.safeParse(body);

  if (!parsed.success) {
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

  const { name, nip, address, zip, email, phone } = parsed.data;

  // Parse address (ZIP is now a separate field)
  const addressParts = address.split(',').map((s) => s.trim());
  const street = addressParts[0] || address;
  const city = addressParts.slice(1).join(', ').trim() || null;

  // Check duplicate NIP (excluding current record)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('buyer_companies')
    .select('id')
    .eq('company_id', u.company_id)
    .eq('nip', nip)
    .neq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      error: 'Inny klient z tym numerem NIP już istnieje w bazie.',
    }, { status: 409 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: updateErr } = await (supabase as any)
    .from('buyer_companies')
    .update({
      name,
      nip,
      street,
      postal_code: zip,
      city,
      email:      email || null,
      phone:      phone || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('company_id', u.company_id)
    .is('deleted_at', null)
    .select('id, name, nip, street, postal_code, city, country, email, phone, billing_email, last_used_at, created_at')
    .single();

  if (updateErr) {
    if (updateErr.code === '23505') {
      return NextResponse.json({
        error: 'Inny klient z tym numerem NIP już istnieje w bazie.',
      }, { status: 409 });
    }
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ error: 'Klient nie został znaleziony.' }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('customer_audit_log').insert({
    company_id:    u.company_id,
    user_id:       user.id,
    event_type:    'created',
    customer_name: name,
    customer_nip:  nip,
    error_detail:  'updated',
  });

  return NextResponse.json({ customer: updated });
}

// ─── DELETE /api/customers/:id ────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: u } = await supabase
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!u?.company_id) return NextResponse.json({ error: 'No company' }, { status: 403 });

  const pkg = await getCompanyPackage(u.company_id);
  if (!canManageCustomers(u.role, pkg.type)) {
    return NextResponse.json({ error: 'Zarządzanie klientami jest dostępne tylko w planie Professional.' }, { status: 403 });
  }

  // Fetch customer to log name before soft-deleting
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer } = await (supabase as any)
    .from('buyer_companies')
    .select('name, nip')
    .eq('id', params.id)
    .eq('company_id', u.company_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!customer) {
    return NextResponse.json({ error: 'Klient nie został znaleziony.' }, { status: 404 });
  }

  // Soft-delete
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: deleteErr } = await (supabase as any)
    .from('buyer_companies')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('company_id', u.company_id);

  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('customer_audit_log').insert({
    company_id:    u.company_id,
    user_id:       user.id,
    event_type:    'created',
    customer_name: customer.name,
    customer_nip:  customer.nip,
    error_detail:  'deleted',
  });

  return NextResponse.json({ ok: true });
}
