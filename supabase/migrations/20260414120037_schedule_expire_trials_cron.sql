/*
  # Schedule daily expire_trials cron job

  ## Summary
  Creates a stored procedure and a pg_cron job that runs once per day at midnight UTC
  to expire any companies whose trial period has ended.

  ## Changes

  ### New Function
  - `expire_trials()` — finds all companies where `is_trial_active = true`
    and `trial_end < now()`, then sets:
      - `is_trial_active = false`
      - `subscription_status = 'trial_expired'`
      - `updated_at = now()`

  ### New Cron Job
  - Job name: `expire-trials`
  - Schedule: `0 0 * * *` (daily at 00:00 UTC)
  - Calls `expire_trials()`

  ## Notes
  - Uses `pg_cron` which is already enabled on this project
  - The cron job is idempotent: safe to run multiple times
  - Any company that has already been expired will not be touched again
    because `is_trial_active` will already be `false`
*/

CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.companies
  SET
    is_trial_active      = false,
    subscription_status  = 'trial_expired',
    updated_at           = now()
  WHERE
    is_trial_active = true
    AND trial_end IS NOT NULL
    AND now() > trial_end;
END;
$$;

SELECT cron.unschedule('expire-trials')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'expire-trials'
);

SELECT cron.schedule(
  'expire-trials',
  '0 0 * * *',
  $$ SELECT public.expire_trials(); $$
);
