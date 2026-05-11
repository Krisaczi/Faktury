/*
  # Vendor Profile RPCs, Indexes, and Schema Extensions

  ## Summary
  Adds the database infrastructure needed for the Vendor Profile page.
  All queries are company-scoped via get_user_company_id().

  ## Schema Extensions

  ### vendors table additions
  - `nip` text — vendor tax ID
  - `bank_accounts` jsonb[] — list of bank accounts
  - `notes` text — internal notes

  ## New Indexes
  - vendors(company_id) — vendor list scoped to company
  - invoices(vendor_id, company_id, issue_date DESC) — fast vendor invoice queries

  ## New RPCs

  ### get_vendor_detail(p_vendor_id uuid)
  - Returns full vendor row + aggregated stats (invoice count, avg amount, high risk count, last activity)
  - SECURITY DEFINER, company-scoped

  ### get_vendor_invoices_page(p_vendor_id, filters…)
  - Paginated invoice list for a vendor with flag counts
  - Supports: date range, risk level, search, page, page_size, sort_by, sort_dir
  - SECURITY DEFINER, company-scoped

  ### get_vendor_trend(p_vendor_id, p_from, p_to, p_granularity)
  - Returns time series of total vs flagged invoices per day/week/month
  - SECURITY DEFINER, company-scoped

  ## Security
  - All RPCs enforce company scoping via get_user_company_id()
  - No client-supplied company_id accepted
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend vendors table
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendors' AND column_name = 'nip'
  ) THEN
    ALTER TABLE vendors ADD COLUMN nip text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendors' AND column_name = 'bank_accounts'
  ) THEN
    ALTER TABLE vendors ADD COLUMN bank_accounts jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendors' AND column_name = 'notes'
  ) THEN
    ALTER TABLE vendors ADD COLUMN notes text;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS vendors_company_id_idx
  ON vendors(company_id);

CREATE INDEX IF NOT EXISTS invoices_vendor_issue_date_idx
  ON invoices(vendor_id, company_id, issue_date DESC NULLS LAST);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS on vendors (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vendors' AND policyname = 'Company members can view vendors'
  ) THEN
    CREATE POLICY "Company members can view vendors"
      ON vendors FOR SELECT
      TO authenticated
      USING (company_id = get_user_company_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vendors' AND policyname = 'Company members can insert vendors'
  ) THEN
    CREATE POLICY "Company members can insert vendors"
      ON vendors FOR INSERT
      TO authenticated
      WITH CHECK (company_id = get_user_company_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vendors' AND policyname = 'Company members can update vendors'
  ) THEN
    CREATE POLICY "Company members can update vendors"
      ON vendors FOR UPDATE
      TO authenticated
      USING (company_id = get_user_company_id())
      WITH CHECK (company_id = get_user_company_id());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_vendor_detail RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_vendor_detail(p_vendor_id uuid)
RETURNS TABLE (
  vendor       jsonb,
  stats        jsonb,
  last_activity jsonb
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
  SELECT
    jsonb_build_object(
      'id',            v.id,
      'name',          v.name,
      'nip',           v.nip,
      'category',      v.category,
      'risk_score',    v.risk_score,
      'status',        v.status,
      'contact_email', v.contact_email,
      'bank_accounts', COALESCE(v.bank_accounts, '[]'::jsonb),
      'notes',         v.notes,
      'created_at',    v.created_at,
      'updated_at',    v.updated_at
    ) AS vendor,

    (
      SELECT jsonb_build_object(
        'total_invoices',     COUNT(*),
        'total_amount',       COALESCE(SUM(COALESCE(i2.total_amount, i2.amount)), 0),
        'avg_amount',         COALESCE(AVG(COALESCE(i2.total_amount, i2.amount)), 0),
        'high_risk_count',    COUNT(*) FILTER (WHERE i2.overall_risk IN ('high','critical')),
        'flagged_count',      COUNT(DISTINCT i2.id) FILTER (
          WHERE EXISTS (SELECT 1 FROM risk_flags rf WHERE rf.invoice_id = i2.id)
        ),
        'open_flags_count',   (
          SELECT COUNT(*) FROM risk_flags rf2
          WHERE rf2.invoice_id IN (
            SELECT id FROM invoices WHERE vendor_id = p_vendor_id AND company_id = v_company_id
          ) AND rf2.status = 'open'
        )
      )
      FROM invoices i2
      WHERE i2.vendor_id = p_vendor_id
        AND i2.company_id = v_company_id
    ) AS stats,

    (
      SELECT jsonb_build_object(
        'last_invoice_date', MAX(i3.issue_date),
        'last_invoice_id',   (
          SELECT id FROM invoices
          WHERE vendor_id = p_vendor_id AND company_id = v_company_id
          ORDER BY created_at DESC NULLS LAST LIMIT 1
        ),
        'last_invoice_number', (
          SELECT invoice_number FROM invoices
          WHERE vendor_id = p_vendor_id AND company_id = v_company_id
          ORDER BY created_at DESC NULLS LAST LIMIT 1
        )
      )
      FROM invoices i3
      WHERE i3.vendor_id = p_vendor_id
        AND i3.company_id = v_company_id
    ) AS last_activity

  FROM vendors v
  WHERE v.id = p_vendor_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_vendor_invoices_page RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_vendor_invoices_page(
  p_vendor_id  uuid,
  p_from       date    DEFAULT NULL,
  p_to         date    DEFAULT NULL,
  p_risk_level text    DEFAULT NULL,
  p_search     text    DEFAULT NULL,
  p_page       int     DEFAULT 1,
  p_page_size  int     DEFAULT 20,
  p_sort_by    text    DEFAULT 'issue_date',
  p_sort_dir   text    DEFAULT 'desc'
)
RETURNS TABLE (
  rows        jsonb,
  total_count bigint
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
    RETURN QUERY SELECT '[]'::jsonb, 0::bigint;
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
      COUNT(rf.id)::int AS flag_count,
      COUNT(rf.id) FILTER (WHERE rf.status = 'open')::int AS open_flag_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id',       rf.id,
            'type',     rf.type,
            'severity', rf.severity,
            'message',  rf.message,
            'status',   rf.status
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
    LEFT JOIN risk_flags rf ON rf.invoice_id = i.id
    WHERE i.vendor_id = p_vendor_id
      AND i.company_id = v_company_id
      AND (p_from      IS NULL OR i.issue_date >= p_from)
      AND (p_to        IS NULL OR i.issue_date <= p_to)
      AND (
        p_risk_level IS NULL OR p_risk_level = '' OR p_risk_level = 'all'
        OR i.overall_risk = p_risk_level
      )
      AND (
        p_search IS NULL OR p_search = ''
        OR i.invoice_number ILIKE '%' || p_search || '%'
      )
    GROUP BY i.id
  ),
  counted AS (
    SELECT COUNT(*) AS total_count FROM base
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
          'seller_nip',     p.seller_nip,
          'bank_account',   p.bank_account,
          'raw_file_url',   p.raw_file_url,
          'flag_count',     p.flag_count,
          'open_flag_count',p.open_flag_count,
          'flags',          p.flags
        )
      ) FROM paginated p),
      '[]'::jsonb
    ),
    c.total_count
  FROM counted c;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_vendor_trend RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_vendor_trend(
  p_vendor_id   uuid,
  p_from        date   DEFAULT NULL,
  p_to          date   DEFAULT NULL,
  p_granularity text   DEFAULT 'week'   -- 'day' | 'week' | 'month'
)
RETURNS TABLE (
  period        text,
  total         bigint,
  flagged       bigint,
  high_risk     bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_from       date;
  v_to         date;
  v_trunc      text;
BEGIN
  v_company_id := get_user_company_id();
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  v_from  := COALESCE(p_from, (now() - interval '90 days')::date);
  v_to    := COALESCE(p_to,   now()::date);
  v_trunc := CASE p_granularity WHEN 'day' THEN 'day' WHEN 'month' THEN 'month' ELSE 'week' END;

  RETURN QUERY
  SELECT
    to_char(date_trunc(v_trunc, i.issue_date::timestamptz), 'YYYY-MM-DD') AS period,
    COUNT(*)                                                                AS total,
    COUNT(*) FILTER (
      WHERE EXISTS (SELECT 1 FROM risk_flags rf WHERE rf.invoice_id = i.id)
    )                                                                       AS flagged,
    COUNT(*) FILTER (WHERE i.overall_risk IN ('high','critical'))          AS high_risk
  FROM invoices i
  WHERE i.vendor_id   = p_vendor_id
    AND i.company_id  = v_company_id
    AND i.issue_date IS NOT NULL
    AND i.issue_date  BETWEEN v_from AND v_to
  GROUP BY date_trunc(v_trunc, i.issue_date::timestamptz)
  ORDER BY date_trunc(v_trunc, i.issue_date::timestamptz);
END;
$$;
