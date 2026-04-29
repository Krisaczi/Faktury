/*
  # Schedule Weekly Summary Email via pg_cron

  ## Summary
  Enables the pg_cron extension and creates a weekly scheduled job that calls
  the `weekly-summary-email` Supabase Edge Function every Monday at 08:00 UTC.

  ## Changes
  1. Enables the `pg_cron` extension in the `pg_catalog` schema
  2. Enables the `pg_net` extension (required for HTTP calls from pg_cron)
  3. Creates a cron job `weekly-summary-email` that fires every Monday at 08:00 UTC
     and makes a POST request to the Edge Function via net.http_post

  ## Notes
  - The cron schedule `0 8 * * 1` means: minute 0, hour 8, any day-of-month, any month, Monday (1)
  - pg_net is used to make the async HTTP call to the Edge Function
  - The existing job is deleted before recreation to make this migration idempotent
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('weekly-summary-email')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'weekly-summary-email'
);

SELECT cron.schedule(
  'weekly-summary-email',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/weekly-summary-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
    ),
    body := '{}'::jsonb
  )
  $$
);
