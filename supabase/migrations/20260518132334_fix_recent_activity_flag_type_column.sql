/*
  # Add flagged_invoices_count to get_homepage_stats RPC

  Adds the count of invoices that are flagged (overall_risk IN ('high','critical')
  OR have at least one risk_flag entry) to the homepage stats payload.
*/

CREATE OR REPLACE FUNCTION public.get_homepage_stats()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_companies       bigint;
  v_vendors         bigint;
  v_avg_mins        numeric;
  v_flagged_invoices bigint;
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

  SELECT COUNT(DISTINCT i.id)
  INTO v_flagged_invoices
  FROM invoices i
  WHERE i.overall_risk IN ('high', 'critical')
     OR EXISTS (
       SELECT 1 FROM risk_flags rf WHERE rf.invoice_id = i.id
     );

  RETURN jsonb_build_object(
    'total_companies',          v_companies,
    'total_vendors',            v_vendors,
    'avg_report_time_minutes',  COALESCE(v_avg_mins, 1.5),
    'flagged_invoices_count',   v_flagged_invoices
  );
END;
$function$;
