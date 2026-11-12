import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { toIban, validateIban } from '@/lib/validations/iban';

export async function POST(
  req: NextRequest,
  { params }: { params: { vendorId: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as
      | { bank_account_number?: unknown; bank_name?: unknown }
      | null;

    const rawIban = typeof body?.bank_account_number === 'string' ? body.bank_account_number : '';
    const ibanError = validateIban(rawIban);
    if (ibanError) {
      return NextResponse.json({ error: ibanError }, { status: 422 });
    }

    const bankName =
      typeof body?.bank_name === 'string' && body.bank_name.trim() ? body.bank_name.trim().slice(0, 120) : null;

    const { data: account, error } = await supabase
      .from('vendor_bank_accounts')
      .insert({
        vendor_id: params.vendorId,
        bank_account_number: toIban(rawIban),
        bank_name: bankName,
        source: 'manual',
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: user.id,
      })
      .select('id, bank_account_number, bank_name, source, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This bank account is already saved for the vendor.' }, { status: 409 });
      }
      if (error.code === '42501') {
        return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    console.error('[api/vendors/[vendorId]/bank-accounts POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
