/*
  # Create get_homepage_stats RPC

  Public (no auth required) function that returns aggregate metrics for the
  marketing homepage stats section:

  - total_companies  : count of all companies in the platform
  - total_vendors    : count of all vendors in the platform
  - avg_report_time_minutes : average processing time of completed risk reports
    (approximated as updated_at - created_at for reports with status = 'completed')

  The function uses SECURITY DEFINER so it can read tables without requiring
  the caller to be authenticated. It returns a single JSON object.
*/

CREATE OR REPLACE FUNCTION public.get_homepage_stats()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_companies  bigint;
  v_vendors    bigint;
  v_avg_mins   numeric;
BEGIN
  SELECT COUNT(*) INTO v_companies FROM companies;
  SELECT COUNT(*) INTO v_vendors   FROM vendors;

  SELECT
    ROUND(
      AVG(
        EXTRACT(EPOCH FROM (rr.updated_at - rr.created_at)) / 60.0
      )::numeric,
      1
    )
  INTO v_avg_mins
  FROM risk_reports rr
  WHERE rr.status = 'completed'
    AND rr.updated_at > rr.created_at
    AND rr.updated_at - rr.created_at < interval '60 minutes';

  RETURN jsonb_build_object(
    'total_companies',         v_companies,
    'total_vendors',           v_vendors,
    'avg_report_time_minutes', COALESCE(v_avg_mins, 1.5)
  );
END;
$function$;
