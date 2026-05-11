/*
  # Invoice Reviews and Audit Logs

  ## Summary
  Adds tables for tracking invoice review actions and a general-purpose audit log
  for all invoice-level operations. Also adds supporting columns to risk_flags
  for acknowledgment/dismissal workflow.

  ## New Tables

  ### invoice_reviews
  - Records manual review decisions on invoices (reviewed, approved, flagged_for_follow_up)
  - Links reviewer (user), invoice, and optional note
  - RLS: company members can read; company members can insert own reviews

  ### audit_logs
  - Append-only log of all invoice actions (view, download, flag_ack, flag_dismiss, review)
  - company_id scoped; no updates/deletes allowed
  - RLS: admins/owners can read; any authenticated member can insert

  ## Modified Tables

  ### risk_flags
  - Adds `status` column: 'open' | 'acknowledged' | 'dismissed'
  - Adds `acknowledged_by` uuid FK to users
  - Adds `acknowledged_at` timestamptz

  ## New RPCs

  ### get_invoice_detail(p_invoice_id uuid)
  - Returns full invoice row + aggregated flags + vendor summary
  - SECURITY DEFINER, company-scoped

  ### get_vendor_summary(p_vendor_id uuid)
  - Returns vendor profile + invoice count, avg risk, recent invoices
  - SECURITY DEFINER, company-scoped

  ## Security
  - RLS enabled on all new tables
  - All policies use auth.uid() and get_user_company_id()
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend risk_flags with acknowledgment workflow
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'risk_flags' AND column_name = 'status'
  ) THEN
    ALTER TABLE risk_flags ADD COLUMN status text NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'acknowledged', 'dismissed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'risk_flags' AND column_name = 'acknowledged_by'
  ) THEN
    ALTER TABLE risk_flags ADD COLUMN acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'risk_flags' AND column_name = 'acknowledged_at'
  ) THEN
    ALTER TABLE risk_flags ADD COLUMN acknowledged_at timestamptz;
  END IF;
END $$;

-- RLS on risk_flags (may already exist from earlier migrations — recreate idempotently)
ALTER TABLE risk_flags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'risk_flags' AND policyname = 'Company members can view risk flags'
  ) THEN
    CREATE POLICY "Company members can view risk flags"
      ON risk_flags FOR SELECT
      TO authenticated
      USING (
        invoice_id IN (
          SELECT id FROM invoices WHERE company_id = get_user_company_id()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'risk_flags' AND policyname = 'Company members can insert risk flags'
  ) THEN
    CREATE POLICY "Company members can insert risk flags"
      ON risk_flags FOR INSERT
      TO authenticated
      WITH CHECK (
        invoice_id IN (
          SELECT id FROM invoices WHERE company_id = get_user_company_id()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'risk_flags' AND policyname = 'Company members can update own risk flags'
  ) THEN
    CREATE POLICY "Company members can update own risk flags"
      ON risk_flags FOR UPDATE
      TO authenticated
      USING (
        invoice_id IN (
          SELECT id FROM invoices WHERE company_id = get_user_company_id()
        )
      )
      WITH CHECK (
        invoice_id IN (
          SELECT id FROM invoices WHERE company_id = get_user_company_id()
        )
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- invoice_reviews
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_reviews (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  reviewer_id uuid        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'reviewed'
    CHECK (status IN ('reviewed', 'approved', 'flagged_for_follow_up')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_reviews_invoice_idx ON invoice_reviews(invoice_id, created_at DESC);

ALTER TABLE invoice_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view invoice reviews"
  ON invoice_reviews FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE company_id = get_user_company_id()
    )
  );

CREATE POLICY "Company members can insert invoice reviews"
  ON invoice_reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND invoice_id IN (
      SELECT id FROM invoices WHERE company_id = get_user_company_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_logs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  invoice_id  uuid        REFERENCES invoices(id)           ON DELETE SET NULL,
  action      text        NOT NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_company_idx    ON audit_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_invoice_idx    ON audit_logs(invoice_id, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Members can insert audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND user_id = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- get_invoice_detail RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_invoice_detail(p_invoice_id uuid)
RETURNS TABLE (
  invoice  jsonb,
  flags    jsonb,
  reviews  jsonb,
  vendor   jsonb
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
    -- invoice row
    jsonb_build_object(
      'id',             i.id,
      'invoice_number', i.invoice_number,
      'invoice_date',   i.invoice_date,
      'issue_date',     i.issue_date,
      'due_date',       i.due_date,
      'amount',         COALESCE(i.total_amount, i.amount),
      'tax_amount',     i.tax_amount,
      'currency',       i.currency,
      'seller_nip',     i.seller_nip,
      'buyer_nip',      i.buyer_nip,
      'bank_account',   i.bank_account,
      'raw_file_url',   i.raw_file_url,
      'overall_risk',   i.overall_risk,
      'vendor_id',      i.vendor_id,
      'upload_session_id', i.upload_session_id,
      'created_at',     i.created_at
    ) AS invoice,

    -- flags
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',               rf.id,
            'type',             rf.type,
            'severity',         rf.severity,
            'message',          rf.message,
            'status',           rf.status,
            'acknowledged_by',  rf.acknowledged_by,
            'acknowledged_at',  rf.acknowledged_at,
            'created_at',       rf.created_at
          )
          ORDER BY
            CASE rf.severity
              WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
              WHEN 'low' THEN 3 ELSE 4
            END,
            rf.created_at
        )
        FROM risk_flags rf
        WHERE rf.invoice_id = i.id
      ),
      '[]'::jsonb
    ) AS flags,

    -- reviews
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',           ir.id,
            'status',       ir.status,
            'note',         ir.note,
            'reviewer_id',  ir.reviewer_id,
            'created_at',   ir.created_at
          )
          ORDER BY ir.created_at DESC
        )
        FROM invoice_reviews ir
        WHERE ir.invoice_id = i.id
      ),
      '[]'::jsonb
    ) AS reviews,

    -- vendor
    CASE
      WHEN i.vendor_id IS NULL THEN NULL
      ELSE (
        SELECT jsonb_build_object(
          'id',           v.id,
          'name',         v.name,
          'category',     v.category,
          'risk_score',   v.risk_score,
          'status',       v.status,
          'contact_email',v.contact_email
        )
        FROM vendors v WHERE v.id = i.vendor_id
      )
    END AS vendor

  FROM invoices i
  WHERE i.id = p_invoice_id
    AND i.company_id = v_company_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_vendor_summary RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_vendor_summary(p_vendor_id uuid)
RETURNS TABLE (
  vendor          jsonb,
  stats           jsonb,
  recent_invoices jsonb
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
      'id',           v.id,
      'name',         v.name,
      'category',     v.category,
      'risk_score',   v.risk_score,
      'status',       v.status,
      'contact_email',v.contact_email,
      'created_at',   v.created_at
    ) AS vendor,

    (
      SELECT jsonb_build_object(
        'total_invoices',     COUNT(*),
        'total_amount',       COALESCE(SUM(COALESCE(i2.total_amount, i2.amount)), 0),
        'high_risk_count',    COUNT(*) FILTER (WHERE i2.overall_risk IN ('high','critical')),
        'avg_risk_score',     AVG(
          CASE i2.overall_risk
            WHEN 'critical' THEN 4 WHEN 'high' THEN 3
            WHEN 'medium' THEN 2   WHEN 'low'  THEN 1
            ELSE 0
          END
        )
      )
      FROM invoices i2
      WHERE i2.vendor_id = p_vendor_id
        AND i2.company_id = v_company_id
    ) AS stats,

    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',             i3.id,
            'invoice_number', i3.invoice_number,
            'issue_date',     i3.issue_date,
            'amount',         COALESCE(i3.total_amount, i3.amount),
            'currency',       i3.currency,
            'overall_risk',   i3.overall_risk
          )
          ORDER BY i3.issue_date DESC NULLS LAST
        )
        FROM (
          SELECT * FROM invoices
          WHERE vendor_id = p_vendor_id AND company_id = v_company_id
          ORDER BY issue_date DESC NULLS LAST
          LIMIT 5
        ) i3
      ),
      '[]'::jsonb
    ) AS recent_invoices

  FROM vendors v
  WHERE v.id = p_vendor_id;
END;
$$;
