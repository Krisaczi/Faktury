
CREATE OR REPLACE FUNCTION public.get_risk_report_page(
  p_from        date    DEFAULT NULL,
  p_to          date    DEFAULT NULL,
  p_vendor_id   uuid    DEFAULT NULL,
  p_risk_level  text    DEFAULT NULL,
  p_search      text    DEFAULT NULL,
  p_page        int     DEFAULT 1,
  p_page_size   int     DEFAULT 20,
  p_sort_by     text    DEFAULT 'issue_date',
  p_sort_dir    text    DEFAULT 'desc'
)
RETURNS TABLE (
  rows                jsonb,
  total_count         bigint,
  high_risk_count     bigint,
  total_flagged_amount numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
  v_offset     int;
BEGIN
  v_company_id := get_user_company_id();
  IF v_company_id IS NULL THEN
    RETURN QUERY SELECT '[]'::jsonb, 0::bigint, 0::bigint, 0::numeric;
    RETURN;
  END IF;

  v_offset := (GREATEST(p_page, 1) - 1) * GREATEST(p_page_size, 1);

  RETURN QUERY
  WITH base AS (
    SELECT
      i.id,
      i.invoice_number,
      i.issue_date,
      i.due_date,
      COALESCE(i.total_amount, i.amount) AS amount,
      i.currency,
      i.overall_risk,
      i.seller_nip,
      i.seller_name,
      i.bank_account,
      i.raw_file_url,
      i.vendor_id,
      v.name AS vendor_name,
      COUNT(rf.id)::int AS flag_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'type',     rf.type,
            'severity', rf.severity,
            'message',  rf.message
          )
          ORDER BY
            CASE rf.severity
              WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
              WHEN 'low' THEN 3 ELSE 4
            END
        ) FILTER (WHERE rf.id IS NOT NULL),
        '[]'::jsonb
      ) AS flags
    FROM invoices i
    LEFT JOIN vendors  v  ON v.id  = i.vendor_id
    LEFT JOIN risk_flags rf ON rf.invoice_id = i.id
    WHERE i.company_id = v_company_id
      AND (p_from      IS NULL OR i.issue_date >= p_from)
      AND (p_to        IS NULL OR i.issue_date <= p_to)
      AND (p_vendor_id IS NULL OR i.vendor_id  = p_vendor_id)
      AND (
        p_risk_level IS NULL
        OR p_risk_level = ''
        OR p_risk_level = 'all'
        OR i.overall_risk = p_risk_level
      )
      AND (
        p_search IS NULL
        OR p_search = ''
        OR i.invoice_number ILIKE '%' || p_search || '%'
        OR v.name           ILIKE '%' || p_search || '%'
        OR i.seller_name    ILIKE '%' || p_search || '%'
      )
    GROUP BY i.id, i.seller_name, v.name
  ),
  counted AS (
    SELECT
      COUNT(*)                                                       AS total_count,
      COUNT(*) FILTER (WHERE overall_risk = 'high')                 AS high_risk_count,
      COALESCE(SUM(amount) FILTER (WHERE flag_count > 0), 0)        AS total_flagged_amount
    FROM base
  ),
  paginated AS (
    SELECT base.*
    FROM base
    ORDER BY
      CASE WHEN p_sort_by = 'issue_date' AND p_sort_dir = 'desc' THEN issue_date END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'issue_date' AND p_sort_dir = 'asc'  THEN issue_date END ASC  NULLS LAST,
      CASE WHEN p_sort_by = 'amount'     AND p_sort_dir = 'desc' THEN amount     END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'amount'     AND p_sort_dir = 'asc'  THEN amount     END ASC  NULLS LAST,
      id DESC
    LIMIT  GREATEST(p_page_size, 1)
    OFFSET v_offset
  )
  SELECT
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id',             p.id,
          'invoice_number', p.invoice_number,
          'issue_date',     p.issue_date,
          'due_date',       p.due_date,
          'amount',         p.amount,
          'currency',       p.currency,
          'overall_risk',   p.overall_risk,
          'vendor_id',      p.vendor_id,
          'vendor_name',    p.vendor_name,
          'seller_name',    p.seller_name,
          'seller_nip',     p.seller_nip,
          'bank_account',   p.bank_account,
          'raw_file_url',   p.raw_file_url,
          'flag_count',     p.flag_count,
          'flags',          p.flags
        )
      ) FROM paginated p),
      '[]'::jsonb
    ),
    c.total_count,
    c.high_risk_count,
    c.total_flagged_amount
  FROM counted c;
END;
$$;
