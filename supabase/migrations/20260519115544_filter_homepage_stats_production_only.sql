/*
  # Filter homepage stats to production data only

  ## Summary
  Replaces get_homepage_stats() to exclude all demo companies and their
  associated data (invoices, vendors) from the public homepage metrics.

  ## Changes
  - total_companies  : count of companies WHERE is_demo = false
  - total_vendors    : count of vendors whose company has is_demo = false
  - flagged_invoices_count : count of distinct invoices with risk flags,
    scoped to non-demo companies
  - flagged_invoice_amount : sum of amounts for those invoices

  ## Why
  Demo seeds inflate every metric. The homepage should only reflect real
  production usage to avoid misleading prospective customers.
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
  -- Production companies only
  SELECT COUNT(*)
  INTO v_companies
  FROM companies
  WHERE is_demo = false;

  -- Vendors belonging to production companies only
  SELECT COUNT(*)
  INTO v_vendors
  FROM vendors v
  JOIN companies c ON c.id = v.company_id
  WHERE c.is_demo = false;

  -- Flagged invoices in production companies only
  SELECT
    COUNT(DISTINCT i.id),
    COALESCE(SUM(DISTINCT i.amount), 0)
  INTO v_flagged_invoices, v_flagged_invoice_amount
  FROM invoices i
  JOIN companies c ON c.id = i.company_id
  WHERE c.is_demo = false
    AND (
      i.overall_risk IN ('medium', 'high', 'critical')
      OR EXISTS (
        SELECT 1 FROM risk_flags rf WHERE rf.invoice_id = i.id
      )
    );

  RETURN jsonb_build_object(
    'total_companies',          v_companies,
    'total_vendors',            v_vendors,
    'flagged_invoices_count',   v_flagged_invoices,
    'flagged_invoice_amount',   v_flagged_invoice_amount
  );
END;
$function$;
