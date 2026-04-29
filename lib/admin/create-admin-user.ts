import { createClient } from '@supabase/supabase-js';

export async function createAdminUser(email: string, password: string) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    throw new Error(`Failed to create auth user: ${authError?.message}`);
  }

  const { error: profileError } = await supabaseAdmin
    .from('users')
    .update({ role: 'admin' })
    .eq('id', authData.user.id);

  if (profileError) {
    throw new Error(`Failed to set admin role: ${profileError.message}`);
  }

  return { userId: authData.user.id, email };
}
