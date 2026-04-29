/*
  # Update weekly summary cron job to use new project URL

  Updates the cron job URL to point to the current Supabase project.
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
    url := 'https://vnjtyfchataaqkgqumwt.supabase.co/functions/v1/weekly-summary-email',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuanR5ZmNoYXRhYXFrZ3F1bXd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyOTE3NTYsImV4cCI6MjA5MTg2Nzc1Nn0.9g8_bXf4rL97Z9kMapA9KUcpuaLvpqcthAxhsh0kPnI"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
