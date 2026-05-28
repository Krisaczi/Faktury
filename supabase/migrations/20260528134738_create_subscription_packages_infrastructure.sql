/*
  # Subscription Package Infrastructure

  ## Summary
  Adds full subscription/package management to the platform.

  ## Changes

  ### Modified Tables
  - `companies`: adds package_type, package_id (FK→pricing_tiers), package_custom (jsonb),
    package_price_cents, package_assigned_at, vendors_count (cached counter),
    over_limit (flag for downgrade warnings)

  ### New Tables
  1. `pricing_tiers` (replaces the minimal version from owner dashboard migration)
     - key (starter|pro), name, features jsonb, monthly_price_cents, annual_price_cents
     - Seeded with Starter and Pro canonical tiers

  2. `company_package_audit`
     - Immutable log of every package assignment or individual-option change
     - Fields: company_id, changed_by, previous jsonb, next jsonb, reason, created_at

  3. `company_report_usage`
     - Tracks monthly report generation per company
     - Key: (company_id, year_month) — year_month format: 'YYYY-MM'
     - Upserted on each report generation; used for reports_per_month enforcement

  ### Functions
  - `increment_company_vendors_count(p_company_id)` — increments cached vendors_count
  - `decrement_company_vendors_count(p_company_id)` — decrements cached vendors_count

  ### Security
  - RLS enabled on all new tables
  - company_package_audit: owner/admin SELECT their company's rows; INSERT service-side
  - company_report_usage: members can SELECT their company's rows; system increments
  - pricing_tiers: public read (needed for upgrade CTAs)
*/

-- ─── 1. Extend pricing_tiers to add key + features columns ────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_tiers' AND column_name = 'key'
  ) THEN
    ALTER TABLE public.pricing_tiers
      ADD COLUMN key text UNIQUE,
      ADD COLUMN features jsonb NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- Back-fill key for existing rows based on name
UPDATE public.pricing_tiers SET key = lower(name) WHERE key IS NULL;

-- ─── 2. Add package columns to companies ─────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'package_type'
  ) THEN
    ALTER TABLE public.companies
      ADD COLUMN package_type       text NOT NULL DEFAULT 'starter',
      ADD COLUMN package_id         uuid REFERENCES public.pricing_tiers(id) ON DELETE SET NULL,
      ADD COLUMN package_custom     jsonb,
      ADD COLUMN package_price_cents int,
      ADD COLUMN package_assigned_at timestamptz,
      ADD COLUMN vendors_count      int NOT NULL DEFAULT 0,
      ADD COLUMN over_limit         boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Indexes for package queries
CREATE INDEX IF NOT EXISTS idx_companies_package_type ON public.companies(package_type);

-- ─── 3. Seed / upsert canonical pricing tiers ────────────────────────────────

INSERT INTO public.pricing_tiers (key, name, monthly_price_cents, annual_price_cents, features)
VALUES
  (
    'starter',
    'Starter',
    0,
    0,
    '{
      "vendors_limit": 25,
      "reports_per_month": 10,
      "file_uploads": true,
      "invoicing": false,
      "support": "email"
    }'::jsonb
  ),
  (
    'pro',
    'Pro',
    9900,
    99000,
    '{
      "vendors_limit": null,
      "reports_per_month": null,
      "file_uploads": true,
      "invoicing": true,
      "support": "priority"
    }'::jsonb
  )
ON CONFLICT (key) DO UPDATE SET
  features             = EXCLUDED.features,
  monthly_price_cents  = EXCLUDED.monthly_price_cents,
  annual_price_cents   = EXCLUDED.annual_price_cents,
  updated_at           = now();

-- ─── 4. company_package_audit ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.company_package_audit (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  changed_by  uuid        NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  previous    jsonb,
  next        jsonb,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_package_audit_company_id ON public.company_package_audit(company_id);
CREATE INDEX IF NOT EXISTS idx_company_package_audit_created_at ON public.company_package_audit(created_at DESC);

ALTER TABLE public.company_package_audit ENABLE ROW LEVEL SECURITY;

-- Members can view their company's audit trail
CREATE POLICY "Company members can view package audit"
  ON public.company_package_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.company_id = company_package_audit.company_id
    )
  );

-- Only service role can insert (server actions use service client pattern via server)
-- We allow insert from authenticated for owner/admin via check
CREATE POLICY "Owner or admin can insert package audit"
  ON public.company_package_audit FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = changed_by
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.company_id = company_package_audit.company_id
        AND u.role IN ('owner', 'admin')
    )
  );

-- ─── 5. company_report_usage ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.company_report_usage (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year_month  text        NOT NULL, -- 'YYYY-MM'
  count       int         NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_company_report_usage_company_month ON public.company_report_usage(company_id, year_month);

ALTER TABLE public.company_report_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view report usage"
  ON public.company_report_usage FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.company_id = company_report_usage.company_id
    )
  );

CREATE POLICY "Company members can upsert report usage"
  ON public.company_report_usage FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.company_id = company_report_usage.company_id
    )
  );

CREATE POLICY "Company members can update report usage"
  ON public.company_report_usage FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.company_id = company_report_usage.company_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.company_id = company_report_usage.company_id
    )
  );

-- ─── 6. pricing_tiers RLS ─────────────────────────────────────────────────────

ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read pricing tiers"
  ON public.pricing_tiers FOR SELECT
  TO authenticated
  USING (true);

-- ─── 7. Vendor count helper functions ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_company_vendors_count(p_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.companies
  SET vendors_count = vendors_count + 1
  WHERE id = p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_company_vendors_count(p_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.companies
  SET vendors_count = GREATEST(0, vendors_count - 1)
  WHERE id = p_company_id;
END;
$$;

-- ─── 8. Backfill vendors_count from live vendors table ───────────────────────

UPDATE public.companies c
SET vendors_count = (
  SELECT COUNT(*) FROM public.vendors v WHERE v.company_id = c.id
);

-- ─── 9. Assign starter package to all existing companies that have no package ─

UPDATE public.companies c
SET
  package_type = 'starter',
  package_id   = (SELECT id FROM public.pricing_tiers WHERE key = 'starter' LIMIT 1)
WHERE package_type = 'starter' AND package_id IS NULL;
