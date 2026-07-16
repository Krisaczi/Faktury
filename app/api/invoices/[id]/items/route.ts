import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: items, error } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', params.id)
      .order('position', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: items ?? [] });
  } catch (err) {
    console.error('[api/invoices/[id]/items]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
