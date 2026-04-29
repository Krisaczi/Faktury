'use server';

import { createClient } from '@supabase/supabase-js';
import { isAdmin } from '@/lib/admin/is-admin';
import { revalidatePath } from 'next/cache';

export async function deactivateCompanySubscription(companyId: string) {
  const adminCheck = await isAdmin();
  if (!adminCheck) throw new Error('Unauthorized');

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await supabaseAdmin
    .from('companies')
    .update({ subscription_status: 'cancelled' })
    .eq('id', companyId);

  if (error) throw new Error(error.message);

  revalidatePath('/admin');
}
