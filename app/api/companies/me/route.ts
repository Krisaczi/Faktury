import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
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

    const { data: company, error } = await supabase
      .from('companies')
      .select('id, name, nip, currency, ingestion_email, subscription_status, created_at, updated_at')
      .eq('id', userRecord.company_id)
      .maybeSingle();

    if (error || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    return NextResponse.json({ company, role: userRecord.role });
  } catch (err) {
    console.error('[api/companies/me]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
