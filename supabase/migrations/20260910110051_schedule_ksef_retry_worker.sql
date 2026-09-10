-- Schedule the ksefRetryWorker edge function to run every 2 minutes
-- so queued KSeF submissions are retried automatically.

-- The edge function URL uses the project's anon key for auth (verify_jwt = false)
-- so we just need to POST to the function endpoint.
-- pg_net is already installed and provides net.http_post.

-- Remove any existing schedule first (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('ksef-retry-worker');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

-- Schedule every 2 minutes
SELECT cron.schedule(
  'ksef-retry-worker',
  '*-2/2 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://hnfthqxlgllszyyhfsnv.supabase.co/functions/v1/ksefRetryWorker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key', true)
      ),
      body := '{}'::jsonb
    )
  $$
);
