import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const numberingSchema = z.object({
  mode: z.enum(['auto', 'manual']),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = numberingSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
    }

    const { data: mode, error } = await supabase.rpc('set_invoice_numbering_mode', {
      p_mode: parsed.data.mode,
    });

    if (error) {
      console.error('[api/companies/numbering-mode] rpc error', error.message);
      return NextResponse.json({ error: 'Nie udało się zapisać numeracji faktur.' }, { status: 500 });
    }

    return NextResponse.json({ invoice_numbering_mode: mode });
  } catch (err) {
    console.error('[api/companies/numbering-mode]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
