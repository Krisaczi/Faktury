import { createClient } from '@/lib/supabase/server';
import { differenceInCalendarDays } from 'date-fns';
import { Clock } from 'lucide-react';
import Link from 'next/link';
import { pl as t } from '@/lib/i18n/pl';

export async function TrialBanner() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!userRecord?.company_id) return null;

  const { data: company } = await supabase
    .from('companies')
    .select('subscription_status, is_trial_active, trial_end')
    .eq('id', userRecord.company_id)
    .maybeSingle();

  if (!company) return null;

  if (company.subscription_status === 'active') return null;
  if (!company.is_trial_active || !company.trial_end) return null;

  const daysLeft = differenceInCalendarDays(new Date(company.trial_end), new Date());
  const days = Math.max(0, daysLeft);
  const label = days === 1 ? t.trial.day : t.trial.days;

  return (
    <div className="flex items-center justify-between gap-4 border-b border-amber-200 bg-amber-50 px-6 py-3">
      <div className="flex items-center gap-2.5 text-sm text-amber-800">
        <Clock className="h-4 w-4 shrink-0 text-amber-600" />
        <span>
          {t.trial.bannerText(days, label)}
        </span>
      </div>
      <Link
        href="/pricing"
        className="shrink-0 rounded-md bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
      >
        {t.trial.upgradeNow}
      </Link>
    </div>
  );
}
