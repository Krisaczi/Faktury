import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const logoSchema = z.object({
  logo_path: z.string().max(300).nullable(),
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

    const parsed = logoSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
    }

    const { data: logoPath, error } = await supabase.rpc('set_company_logo_path', {
      p_path: parsed.data.logo_path,
    });

    if (error) {
      console.error('[api/companies/logo] rpc error', error.message);
      if (error.message.includes('INVALID_LOGO_PATH')) {
        return NextResponse.json({ error: 'Invalid logo path' }, { status: 422 });
      }
      return NextResponse.json({ error: 'Nie udało się zapisać logo.' }, { status: 500 });
    }

    return NextResponse.json({ logo_path: logoPath });
  } catch (err) {
    console.error('[api/companies/logo]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
