import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileCount, source = 'manual' } = await req.json();

    // Resolve company_id
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (userError || !userRecord?.company_id) {
      return NextResponse.json({ error: 'Company not found' }, { status: 403 });
    }

    const companyId = userRecord.company_id;
    const sessionId = crypto.randomUUID();
    const storagePath = `companies/${companyId}/uploads/${sessionId}`;

    const { data: session, error: sessionError } = await supabase
      .from('upload_sessions')
      .insert({
        id: sessionId,
        company_id: companyId,
        user_id: user.id,
        source,
        status: 'pending',
        file_count: fileCount ?? 0,
        storage_path: storagePath,
      })
      .select('id, storage_path')
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: sessionError?.message ?? 'Failed to create session' }, { status: 500 });
    }

    return NextResponse.json({
      uploadSessionId: session.id,
      storagePath: session.storage_path,
      companyId,
    });
  } catch (err) {
    console.error('[upload-session]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
