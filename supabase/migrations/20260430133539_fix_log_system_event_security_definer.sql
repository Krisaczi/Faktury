/*
  # Fix log_system_event function to use SECURITY DEFINER

  ## Problem
  The trigger trg_log_company_created fires on INSERT to companies and calls
  log_system_event(), which inserts into system_logs. The system_logs RLS INSERT
  policy only allows service_role. When an authenticated user creates a company,
  the trigger runs as that user and the system_logs insert is blocked by RLS,
  causing the entire companies INSERT to fail with an RLS violation.

  ## Fix
  Recreate log_system_event() with SECURITY DEFINER so it executes with the
  privileges of the function owner (postgres/superuser), bypassing RLS for the
  system_logs insert regardless of who triggered it.
*/

CREATE OR REPLACE FUNCTION log_system_event(
  p_event_type text,
  p_level text,
  p_message text,
  p_detail text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO system_logs(event_type, level, message, detail, company_id, user_id)
  VALUES (p_event_type, p_level, p_message, p_detail, p_company_id, p_user_id);
END;
$$;
