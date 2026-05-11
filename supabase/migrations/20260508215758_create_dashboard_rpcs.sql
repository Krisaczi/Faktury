/*
  # Dashboard RPC Functions

  ## Overview
  Creates three SECURITY DEFINER RPC functions that return company-scoped
  dashboard metrics for the authenticated user. All functions call
  get_user_company_id() internally so no cross-company data is ever exposed.

  ## Functions

  ### 1. get_dashboard_metrics()
  Returns aggregated KPIs:
  - total_invoices_30d: invoice count in the last 30 days
  - high_risk_count: invoices where overall_risk = 'high' (all time)
  - flagged_amount_sum: sum of total_amount for invoices that have at least one risk_flag

  ### 2. get_invoice_timeseries()
  Returns daily invoice counts vs flagged invoice counts for the last 30 days.
  Rows: date (date), total (int), flagged (int)

  ### 3. get_recent_activity()
  Returns the 10 most recent events across invoices, risk_flags, and upload_sessions
  for the company, ordered by created_at desc.
  Rows: id (uuid), kind (text), label (text), created_at (timestamptz)
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. get_dashboard_metrics
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_dashboard_metrics()
RETURNS TABLE (
  total_invoices_30d   bigint,
  high_risk_count      bigint,
  flagged_amount_sum   numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := get_user_company_id();

  IF v_company_id IS NULL THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::numeric;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    -- invoices in last 30 days
    (
      SELECT COUNT(*)
      FROM invoices i
      WHERE i.company_id = v_company_id
        AND i.created_at >= now() - interval '30 days'
    )::bigint AS total_invoices_30d,

    -- high-risk invoices (all time)
    (
      SELECT COUNT(*)
      FROM invoices i
      WHERE i.company_id = v_company_id
        AND i.overall_risk = 'high'
    )::bigint AS high_risk_count,

    -- sum of total_amount for flagged invoices
    (
      SELECT COALESCE(SUM(i.total_amount), 0)
      FROM invoices i
      WHERE i.company_id = v_company_id
        AND EXISTS (
          SELECT 1 FROM risk_flags rf WHERE rf.invoice_id = i.id
        )
    )::numeric AS flagged_amount_sum;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_invoice_timeseries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_invoice_timeseries()
RETURNS TABLE (
  day      date,
  total    bigint,
  flagged  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := get_user_company_id();

  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      (now() - interval '29 days')::date,
      now()::date,
      interval '1 day'
    )::date AS day
  ),
  daily_totals AS (
    SELECT
      i.created_at::date AS day,
      COUNT(*) AS total,
      COUNT(*) FILTER (
        WHERE EXISTS (SELECT 1 FROM risk_flags rf WHERE rf.invoice_id = i.id)
      ) AS flagged
    FROM invoices i
    WHERE i.company_id = v_company_id
      AND i.created_at >= now() - interval '29 days'
    GROUP BY i.created_at::date
  )
  SELECT
    d.day,
    COALESCE(dt.total, 0)::bigint,
    COALESCE(dt.flagged, 0)::bigint
  FROM days d
  LEFT JOIN daily_totals dt ON dt.day = d.day
  ORDER BY d.day;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_recent_activity
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_recent_activity()
RETURNS TABLE (
  id         uuid,
  kind       text,
  label      text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := get_user_company_id();

  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  (
    SELECT
      i.id,
      'invoice'::text AS kind,
      ('Invoice ' || i.invoice_number || ' · ' || i.currency || ' ' || i.total_amount::text)::text AS label,
      i.created_at
    FROM invoices i
    WHERE i.company_id = v_company_id
    ORDER BY i.created_at DESC
    LIMIT 5
  )
  UNION ALL
  (
    SELECT
      rf.id,
      'flag'::text AS kind,
      ('Risk flag: ' || rf.flag_type || ' on invoice ' || i.invoice_number)::text AS label,
      rf.created_at
    FROM risk_flags rf
    JOIN invoices i ON i.id = rf.invoice_id
    WHERE i.company_id = v_company_id
    ORDER BY rf.created_at DESC
    LIMIT 5
  )
  UNION ALL
  (
    SELECT
      us.id,
      'upload'::text AS kind,
      ('Upload: ' || us.filename || ' (' || us.status || ')')::text AS label,
      us.created_at
    FROM upload_sessions us
    WHERE us.company_id = v_company_id
    ORDER BY us.created_at DESC
    LIMIT 5
  )
  ORDER BY created_at DESC
  LIMIT 10;
END;
$$;
