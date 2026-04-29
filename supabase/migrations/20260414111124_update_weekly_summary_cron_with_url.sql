/*
  # Update weekly summary cron job with concrete Edge Function URL

  ## Summary
  Replaces the previous cron job definition with one that uses the project's
  actual Supabase URL and anon key so the HTTP call to the Edge Function works
  without relying on app-level GUCs that are not set.

  ## Changes
  - Unschedules the existing `weekly-summary-email` job
  - Re-schedules it with the hardcoded project URL and anon key in the HTTP call
  - Schedule unchanged: every Monday at 08:00 UTC (`0 8 * * 1`)
*/

SELECT cron.unschedule('weekly-summary-email')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'weekly-summary-email'
);

SELECT cron.schedule(
  'weekly-summary-email',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://uceyvunkllazjcezhlmb.supabase.co/functions/v1/weekly-summary-email',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjZXl2dW5rbGxhempjZXpobG1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjg3NjMsImV4cCI6MjA5MTcwNDc2M30.HlGIgSfDA10esbNMw9T2KonzKKxTt3w3vFNgR9SCPic"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
