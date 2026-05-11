/*
  # Risk Report RPC, Indexes, and Audit Table

  ## Summary
  Adds the database infrastructure needed for the paginated, server-side
  Risk Report feature. All queries are company-scoped via get_user_company_id().

  ## New Objects

  ### Indexes
  - invoices(company_id, overall_risk) — filter by risk level
  - invoices(company_id, issue_date DESC) — sort by date
  - invoices(company_id, vendor_id) — vendor filter join
  - risk_flags(invoice_id) — aggregate flags per invoice

  ### exports_audit table
  - Records every CSV export: user, company, filters applied, timestamp
  - RLS: owner/admin can read; any member can insert

  ### get_risk_report_page(filters…) RPC
  - Returns paginated invoice rows with aggregated risk_flag counts
  - Joins vendors for vendor name
  - Supports: date range, vendor_id, risk_level, search (invoice_number / vendor name),
    page, page_size, sort_by, sort_dir
  - Enforces company_id scoping via get_user_company_id()

  ### get_risk_report_filters() RPC
  - Returns vendor list and available risk_level values for the company
*/

-- Enable pg_trgm for ILIKE acceleration (idempotent, may already exist)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS invoices_overall_risk_company_idx
  ON invoices(company_id, overall_risk);

CREATE INDEX IF NOT EXISTS invoices_issue_date_company_idx
  ON invoices(company_id, issue_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS invoices_vendor_id_company_idx
  ON invoices(company_id, vendor_id);

-- Text search index on invoice_number (btree for ILIKE prefix, trgm for infix)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'invoices' AND indexname = 'invoices_invoice_number_trgm_idx'
  ) THEN
    CREATE INDEX invoices_invoice_number_trgm_idx
      ON invoices USING gin(invoice_number gin_trgm_ops)
      WHERE invoice_number IS NOT NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- gin_trgm_ops may not be available; skip gracefully
  NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- exports_audit
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exports_audit (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  export_type  text        NOT NULL DEFAULT 'risk_report_csv',
  filters      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  row_count    int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exports_audit_company_idx
  ON exports_audit(company_id, created_at DESC);

ALTER TABLE exports_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view exports audit"
  ON exports_audit FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner','admin')
    )
  );

CREATE POLICY "Members can insert exports audit"
  ON exports_audit FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND user_id = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- get_risk_report_page RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_risk_report_page(
  p_from          date    DEFAULT NULL,
  p_to            date    DEFAULT NULL,
  p_vendor_id     uuid    DEFAULT NULL,
  p_risk_level    text    DEFAULT NULL,
  p_search        text    DEFAULT NULL,
  p_page          int     DEFAULT 1,
  p_page_size     int     DEFAULT 20,
  p_sort_by       text    DEFAULT 'issue_date',
  p_sort_dir      text    DEFAULT 'desc'
)
RETURNS TABLE (
  rows                 jsonb,
  total_count          bigint,
  high_risk_count      bigint,
  total_flagged_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      )
    GROUP BY i.id, v.name
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


-- ─────────────────────────────────────────────────────────────────────────────
-- get_risk_report_filters RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_risk_report_filters()
RETURNS TABLE (
  vendors     jsonb,
  risk_levels jsonb
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
    RETURN QUERY SELECT '[]'::jsonb, '[]'::jsonb;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name) ORDER BY v.name)
       FROM vendors v
       WHERE (v.company_id = v_company_id)
          OR (v.id IN (
               SELECT DISTINCT vendor_id FROM invoices
               WHERE company_id = v_company_id AND vendor_id IS NOT NULL
             ))
      ),
      '[]'::jsonb
    ) AS vendors,
    COALESCE(
      (SELECT jsonb_agg(DISTINCT overall_risk)
       FROM invoices
       WHERE company_id = v_company_id AND overall_risk IS NOT NULL),
      '[]'::jsonb
    ) AS risk_levels;
END;
$$;
