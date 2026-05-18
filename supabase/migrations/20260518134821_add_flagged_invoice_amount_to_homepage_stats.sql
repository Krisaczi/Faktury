/*
  # Add flagged_invoice_amount to get_homepage_stats RPC

  Replaces the avg_report_time_minutes field with the total PLN amount
  of all flagged invoices.

  Flagged invoices are defined as invoices where:
    - overall_risk IN ('medium', 'high', 'critical')
    OR
    - at least one row exists in risk_flags for that invoice

  The sum is computed over invoices.amount (assumed to be in PLN).
*/

CREATE OR REPLACE FUNCTION public.get_homepage_stats()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_companies              bigint;
  v_vendors                bigint;
  v_flagged_invoices       bigint;
  v_flagged_invoice_amount numeric;
BEGIN
  SELECT COUNT(*) INTO v_companies FROM companies;
  SELECT COUNT(*) INTO v_vendors   FROM vendors;

  SELECT
    COUNT(DISTINCT i.id),
    COALESCE(SUM(DISTINCT i.amount), 0)
  INTO v_flagged_invoices, v_flagged_invoice_amount
  FROM invoices i
  WHERE i.overall_risk IN ('medium', 'high', 'critical')
     OR EXISTS (
       SELECT 1 FROM risk_flags rf WHERE rf.invoice_id = i.id
     );

  RETURN jsonb_build_object(
    'total_companies',          v_companies,
    'total_vendors',            v_vendors,
    'flagged_invoices_count',   v_flagged_invoices,
    'flagged_invoice_amount',   v_flagged_invoice_amount
  );
END;
$function$;
