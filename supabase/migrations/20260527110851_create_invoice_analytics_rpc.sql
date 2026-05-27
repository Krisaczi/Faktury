/*
  # Invoice Analytics RPC Functions

  Creates two server-side aggregation functions for the invoicing dashboard.

  ## New Functions

  ### 1. get_invoice_monthly_stats(p_company_id, p_from, p_to)
  Returns one row per calendar month (within the given date range) with:
    - month          TEXT     'YYYY-MM'
    - invoice_count  BIGINT   total invoices in that month
    - net_total      NUMERIC  sum of net_total
    - gross_total    NUMERIC  sum of gross_total
    - vat_total      NUMERIC  sum of vat_total

  ### 2. get_invoice_status_breakdown(p_company_id, p_from, p_to)
  Returns one row per invoice status with:
    - status         TEXT
    - invoice_count  BIGINT
    - net_total      NUMERIC
    - gross_total    NUMERIC

  ## Security
  - Both functions use SECURITY DEFINER but validate the calling user belongs
    to the requested company before returning data.
  - Exposed as stable, non-volatile functions (STABLE keyword).
*/

-- ─── 1. Monthly stats ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_invoice_monthly_stats(
  p_company_id uuid,
  p_from        date DEFAULT NULL,
  p_to          date DEFAULT NULL
)
RETURNS TABLE (
  month         text,
  invoice_count bigint,
  net_total     numeric,
  gross_total   numeric,
  vat_total     numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must belong to the requested company
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    to_char(date_trunc('month', ii.issue_date), 'YYYY-MM') AS month,
    count(*)::bigint                                        AS invoice_count,
    coalesce(sum(ii.net_total),   0)::numeric               AS net_total,
    coalesce(sum(ii.gross_total), 0)::numeric               AS gross_total,
    coalesce(sum(ii.vat_total),   0)::numeric               AS vat_total
  FROM public.issued_invoices ii
  WHERE
    ii.company_id = p_company_id
    AND (p_from IS NULL OR ii.issue_date >= p_from)
    AND (p_to   IS NULL OR ii.issue_date <= p_to)
  GROUP BY date_trunc('month', ii.issue_date)
  ORDER BY date_trunc('month', ii.issue_date);
END;
$$;

-- ─── 2. Status breakdown ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_invoice_status_breakdown(
  p_company_id uuid,
  p_from        date DEFAULT NULL,
  p_to          date DEFAULT NULL
)
RETURNS TABLE (
  status        text,
  invoice_count bigint,
  net_total     numeric,
  gross_total   numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    ii.status::text                                         AS status,
    count(*)::bigint                                        AS invoice_count,
    coalesce(sum(ii.net_total),   0)::numeric               AS net_total,
    coalesce(sum(ii.gross_total), 0)::numeric               AS gross_total
  FROM public.issued_invoices ii
  WHERE
    ii.company_id = p_company_id
    AND (p_from IS NULL OR ii.issue_date >= p_from)
    AND (p_to   IS NULL OR ii.issue_date <= p_to)
  GROUP BY ii.status
  ORDER BY ii.status;
END;
$$;

-- ─── 3. KPI summary ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_invoice_kpi_summary(
  p_company_id uuid,
  p_from        date DEFAULT NULL,
  p_to          date DEFAULT NULL
)
RETURNS TABLE (
  total_invoices     bigint,
  total_net          numeric,
  total_gross        numeric,
  total_vat          numeric,
  accepted_count     bigint,
  rejected_count     bigint,
  pending_ksef_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    count(*)::bigint                                                                        AS total_invoices,
    coalesce(sum(ii.net_total),   0)::numeric                                              AS total_net,
    coalesce(sum(ii.gross_total), 0)::numeric                                              AS total_gross,
    coalesce(sum(ii.vat_total),   0)::numeric                                              AS total_vat,
    count(*) FILTER (WHERE ii.status = 'accepted')::bigint                                AS accepted_count,
    count(*) FILTER (WHERE ii.status = 'rejected')::bigint                                AS rejected_count,
    count(*) FILTER (WHERE ii.status IN ('sent_to_ksef') OR ii.ksef_status IN ('pending','processing'))::bigint AS pending_ksef_count
  FROM public.issued_invoices ii
  WHERE
    ii.company_id = p_company_id
    AND (p_from IS NULL OR ii.issue_date >= p_from)
    AND (p_to   IS NULL OR ii.issue_date <= p_to);
END;
$$;
