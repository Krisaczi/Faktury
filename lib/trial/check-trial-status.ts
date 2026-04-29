import { createClient } from '@/lib/supabase/server';

export type TrialStatus = 'active' | 'trial_active' | 'trial_expired';

export async function checkTrialStatus(companyId: string): Promise<TrialStatus> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('companies')
    .select('trial_start, trial_end, subscription_status')
    .eq('id', companyId)
    .maybeSingle();

  if (error || !data) {
    return 'trial_expired';
  }

  if (data.subscription_status === 'active') {
    return 'active';
  }

  if (data.trial_end && new Date() < new Date(data.trial_end)) {
    return 'trial_active';
  }

  return 'trial_expired';
}
