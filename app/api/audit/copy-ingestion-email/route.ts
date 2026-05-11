import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function POST() {
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
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) {
      return NextResponse.json({ error: 'No company found' }, { status: 404 });
    }

    await supabase.from('settings_audit').insert({
      company_id: userRecord.company_id,
      user_id:    user.id,
      action:     'ingestion_email_copied',
      metadata:   {},
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/audit/copy-ingestion-email]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
