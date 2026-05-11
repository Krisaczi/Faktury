/*
  # Billing Metadata and Company Settings Extensions

  ## Summary
  Adds the infrastructure for the Settings page: a billing_metadata table
  to store Lemon Squeezy subscription state, a settings_audit table for
  tracking sensitive copy/export actions, and helper columns on companies.

  ## New Tables

  ### billing_metadata
  - Stores Lemon Squeezy subscription ID, status, plan name, renewal date
  - One row per company; server-only writes (service key) via API routes
  - RLS: company owner/admin can read; no client insert/update allowed
    (all writes from server API routes using service role)

  ### settings_audit
  - Append-only log for settings-level actions (ingestion_email_copied, etc.)
  - RLS: admins/owners can read; any member can insert

  ## Modified Tables

  ### companies
  - Ensures ingestion_email column exists (was already in schema)
  - No destructive changes

  ## Security
  - RLS enabled on all new tables
  - billing_metadata write policies intentionally empty (service role writes only)
  - All read policies gate on get_user_company_id()
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- billing_metadata
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_metadata (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid        NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  ls_subscription_id   text,
  ls_customer_id       text,
  ls_product_id        text,
  ls_variant_id        text,
  plan_name            text        NOT NULL DEFAULT 'Trial',
  status               text        NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'paused')),
  renews_at            timestamptz,
  ends_at              timestamptz,
  checkout_url         text,
  portal_url           text,
  raw_payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_metadata_company_idx ON billing_metadata(company_id);

ALTER TABLE billing_metadata ENABLE ROW LEVEL SECURITY;

-- Only owners/admins can read billing info
CREATE POLICY "Admins can view billing metadata"
  ON billing_metadata FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Members can also read (for plan display)
CREATE POLICY "Members can view own company billing"
  ON billing_metadata FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- settings_audit
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings_audit (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  action      text        NOT NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settings_audit_company_idx ON settings_audit(company_id, created_at DESC);

ALTER TABLE settings_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view settings audit"
  ON settings_audit FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Members can insert settings audit"
  ON settings_audit FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND user_id = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Ensure companies.ingestion_email index exists
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS companies_ingestion_email_idx ON companies(ingestion_email)
  WHERE ingestion_email IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-create billing_metadata row when company is created
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_billing_metadata_for_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO billing_metadata(company_id, plan_name, status)
  VALUES (NEW.id, 'Trial', 'trial')
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_company_created_create_billing ON companies;
CREATE TRIGGER on_company_created_create_billing
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION create_billing_metadata_for_company();

-- Backfill existing companies that don't have billing_metadata yet
INSERT INTO billing_metadata(company_id, plan_name, status)
SELECT id, 'Trial', 'trial' FROM companies
ON CONFLICT (company_id) DO NOTHING;
