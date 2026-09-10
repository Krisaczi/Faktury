-- Re-schedule ksefRetryWorker without relying on app settings.
-- The function has verify_jwt = false, so no auth header needed.

DO $$
BEGIN
  PERFORM cron.unschedule('ksef-retry-worker');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

SELECT cron.schedule(
  'ksef-retry-worker',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://hnfthqxlgllszyyhfsnv.supabase.co/functions/v1/ksefRetryWorker',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{}'::jsonb
    )
  $$
);
