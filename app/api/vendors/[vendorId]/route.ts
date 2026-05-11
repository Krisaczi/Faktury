import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
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

    const { data, error } = await supabase.rpc('get_vendor_detail', {
      p_vendor_id: params.vendorId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row?.vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (err) {
    console.error('[api/vendors/[vendorId] GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
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

    const { data: userRecord } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const {
      name,
      category,
      contact_email,
      status,
      risk_score,
      nip,
      bank_accounts,
      notes,
    } = body as {
      name?: string;
      category?: string | null;
      contact_email?: string | null;
      status?: 'active' | 'inactive' | 'under_review';
      risk_score?: number | null;
      nip?: string | null;
      bank_accounts?: unknown[];
      notes?: string | null;
    };

    const updateData: Record<string, unknown> = {};
    if (name           !== undefined) updateData.name           = name;
    if (category       !== undefined) updateData.category       = category;
    if (contact_email  !== undefined) updateData.contact_email  = contact_email;
    if (status         !== undefined) updateData.status         = status;
    if (risk_score     !== undefined) updateData.risk_score     = risk_score;
    if (nip            !== undefined) updateData.nip            = nip;
    if (bank_accounts  !== undefined) updateData.bank_accounts  = bank_accounts;
    if (notes          !== undefined) updateData.notes          = notes;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: vendor, error } = await supabase
      .from('vendors')
      .update(updateData as never)
      .eq('id', params.vendorId)
      .select('id, name, category, contact_email, status, risk_score, nip, bank_accounts, notes')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from('audit_logs').insert({
      company_id: userRecord.company_id,
      user_id:    user.id,
      action:     'vendor_updated',
      metadata:   { vendor_id: params.vendorId, fields: Object.keys(updateData) },
    });

    return NextResponse.json(vendor);
  } catch (err) {
    console.error('[api/vendors/[vendorId] PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
