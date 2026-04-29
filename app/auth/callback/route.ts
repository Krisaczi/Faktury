import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const { data: userRecord } = await supabase
        .from('users')
        .select('id, onboarded, company_id')
        .eq('id', data.user.id)
        .maybeSingle();

      if (!userRecord) {
        await supabase.from('users').insert({
          id: data.user.id,
          email: data.user.email ?? '',
          onboarded: false,
        });
        return NextResponse.redirect(`${origin}/onboarding`);
      }

      const needsOnboarding = !userRecord.onboarded || !userRecord.company_id;
      if (needsOnboarding) {
        return NextResponse.redirect(`${origin}/onboarding`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
