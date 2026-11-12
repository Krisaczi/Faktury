/*
# Financial overview aggregates

1. New functions
- `get_financial_summary(p_from date, p_to date)` returns revenue, expenses, profit and invoice counts for the caller's company over an inclusive date range.
- `get_financial_trend(p_from date, p_to date, p_bucket text)` returns revenue and expenses grouped by 'day' or 'month' buckets for charting.

2. Calculation rules
- Revenue = issued invoices (issued_invoices.gross_total) with status issued, sent_to_ksef or accepted, dated by issue_date. Drafts, rejected and cancelled invoices are excluded.
- Expenses = received invoices (invoices.total_amount), dated by invoice_date, falling back to issue_date.
- Profit = revenue - expenses.

3. Security
- Both functions are SECURITY INVOKER, so existing row level security on issued_invoices and invoices still applies.
- Results are additionally scoped to get_user_company_id().
- EXECUTE is revoked from PUBLIC and anon and granted only to authenticated.

4. Notes
- Aggregation happens in SQL with SUM and GROUP BY; no invoice rows are sent to the browser.
- Amounts are summed as stored, without currency conversion.
*/

CREATE OR REPLACE FUNCTION get_financial_summary(p_from date, p_to date)
RETURNS TABLE (
  revenue numeric,
  expenses numeric,
  profit numeric,
  revenue_count bigint,
  expense_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH company AS (SELECT get_user_company_id() AS company_id),
  issued AS (
    SELECT ii.gross_total AS amount
    FROM issued_invoices ii, company c
    WHERE ii.company_id = c.company_id
      AND ii.status IN ('issued', 'sent_to_ksef', 'accepted')
      AND ii.issue_date BETWEEN p_from AND p_to
  ),
  received AS (
    SELECT i.total_amount AS amount
    FROM invoices i, company c
    WHERE i.company_id = c.company_id
      AND COALESCE(i.invoice_date, i.issue_date) BETWEEN p_from AND p_to
  )
  SELECT
    COALESCE((SELECT SUM(amount) FROM issued), 0)::numeric AS revenue,
    COALESCE((SELECT SUM(amount) FROM received), 0)::numeric AS expenses,
    (COALESCE((SELECT SUM(amount) FROM issued), 0) - COALESCE((SELECT SUM(amount) FROM received), 0))::numeric AS profit,
    (SELECT COUNT(*) FROM issued)::bigint AS revenue_count,
    (SELECT COUNT(*) FROM received)::bigint AS expense_count;
$$;

CREATE OR REPLACE FUNCTION get_financial_trend(p_from date, p_to date, p_bucket text)
RETURNS TABLE (
  bucket date,
  revenue numeric,
  expenses numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH company AS (SELECT get_user_company_id() AS company_id),
  issued AS (
    SELECT date_trunc(p_bucket, ii.issue_date::timestamp)::date AS b, SUM(ii.gross_total) AS amount
    FROM issued_invoices ii, company c
    WHERE ii.company_id = c.company_id
      AND ii.status IN ('issued', 'sent_to_ksef', 'accepted')
      AND ii.issue_date BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  received AS (
    SELECT date_trunc(p_bucket, COALESCE(i.invoice_date, i.issue_date)::timestamp)::date AS b, SUM(i.total_amount) AS amount
    FROM invoices i, company c
    WHERE i.company_id = c.company_id
      AND COALESCE(i.invoice_date, i.issue_date) BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  buckets AS (
    SELECT b FROM issued UNION SELECT b FROM received
  )
  SELECT
    buckets.b AS bucket,
    COALESCE((SELECT amount FROM issued WHERE issued.b = buckets.b), 0)::numeric AS revenue,
    COALESCE((SELECT amount FROM received WHERE received.b = buckets.b), 0)::numeric AS expenses
  FROM buckets
  ORDER BY buckets.b;
$$;

REVOKE EXECUTE ON FUNCTION get_financial_summary(date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_financial_trend(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_financial_summary(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_financial_trend(date, date, text) TO authenticated;
