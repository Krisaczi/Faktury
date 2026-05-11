/*
  # Multi-tenant SaaS Schema

  ## Summary
  Creates a complete multi-tenant SaaS schema scoped to companies.
  Works alongside the existing profiles/vendors/uploads/risk_reports tables.

  ## New Tables
  - companies        – root tenant entity (name, NIP, currency, subscription)
  - users            – extends auth.users with company_id and role
  - invoices         – financial documents per company/vendor
  - risk_flags       – individual risk signals per invoice
  - upload_sessions  – audit log of upload events

  ## Modified Tables
  - vendors          – gains company_id column (existing user_id preserved)

  ## Security
  - RLS enabled on all new tables
  - Helper function get_user_company_id() resolves the caller's tenant
  - All policies gate access by company_id = get_user_company_id()
  - users table: self-access + admin management patterns
  - Signup trigger auto-creates users row (SECURITY DEFINER)

  ## Notes
  1. The existing vendors table keeps user_id for backwards compatibility;
     company_id is added as nullable and should be backfilled by the app.
  2. Cascades: deleting a company removes vendors, invoices, upload_sessions.
  3. Deleting an invoice cascades to risk_flags.
*/

-- ============================================================
-- COMPANIES
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  nip                 text        NOT NULL,
  currency            text        NOT NULL DEFAULT 'PLN',
  ingestion_email     text,
  subscription_status text        NOT NULL DEFAULT 'trial',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS companies_nip_idx ON companies(nip);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USERS (new table — distinct from existing "profiles")
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          uuid  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text  NOT NULL,
  company_id  uuid  REFERENCES companies(id) ON DELETE SET NULL,
  role        text  NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner', 'admin', 'member')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_company_id_idx ON users(company_id);
CREATE INDEX IF NOT EXISTS users_email_idx      ON users(email);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTION (created after users table exists)
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT company_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- VENDORS — add company_id to existing table
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'vendors'
      AND column_name  = 'company_id'
  ) THEN
    ALTER TABLE vendors
      ADD COLUMN company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
      ADD COLUMN nip         text,
      ADD COLUMN bank_accounts text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS vendors_company_id_new_idx ON vendors(company_id);
CREATE INDEX IF NOT EXISTS vendors_nip_idx            ON vendors(nip);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid    NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_id      uuid    REFERENCES vendors(id) ON DELETE SET NULL,
  invoice_number text,
  amount         numeric,
  currency       text    NOT NULL DEFAULT 'PLN',
  issue_date     date,
  due_date       date,
  bank_account   text,
  file_url       text,
  overall_risk   text    CHECK (overall_risk IN ('low', 'medium', 'high', 'critical')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_company_id_idx   ON invoices(company_id);
CREATE INDEX IF NOT EXISTS invoices_vendor_id_idx    ON invoices(vendor_id);
CREATE INDEX IF NOT EXISTS invoices_due_date_idx     ON invoices(due_date);
CREATE INDEX IF NOT EXISTS invoices_overall_risk_idx ON invoices(overall_risk);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RISK FLAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS risk_flags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  type        text NOT NULL,
  severity    text NOT NULL
              CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  message     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_flags_invoice_id_idx ON risk_flags(invoice_id);
CREATE INDEX IF NOT EXISTS risk_flags_severity_idx   ON risk_flags(severity);

ALTER TABLE risk_flags ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- UPLOAD SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS upload_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  source      text NOT NULL DEFAULT 'manual',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upload_sessions_company_id_idx ON upload_sessions(company_id);
CREATE INDEX IF NOT EXISTS upload_sessions_user_id_idx    ON upload_sessions(user_id);

ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER update_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- RLS POLICIES — companies
-- ============================================================
CREATE POLICY "Members can view own company"
  ON companies FOR SELECT
  TO authenticated
  USING (id = get_user_company_id());

CREATE POLICY "Owners can update own company"
  ON companies FOR UPDATE
  TO authenticated
  USING (
    id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- ============================================================
-- RLS POLICIES — users
-- ============================================================
CREATE POLICY "Users can view own record"
  ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can view company members"
  ON users FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = get_user_company_id()
  );

CREATE POLICY "Users can insert own record"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own record"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can update company members"
  ON users FOR UPDATE
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users u2
      WHERE u2.id = auth.uid()
        AND u2.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND company_id = get_user_company_id()
  );

-- ============================================================
-- RLS POLICIES — vendors (new company-scoped policies)
-- ============================================================
CREATE POLICY "Company members can view vendors"
  ON vendors FOR SELECT
  TO authenticated
  USING (
    (company_id IS NOT NULL AND company_id = get_user_company_id())
    OR user_id = auth.uid()
  );

CREATE POLICY "Company members can insert vendors"
  ON vendors FOR INSERT
  TO authenticated
  WITH CHECK (
    (company_id IS NOT NULL AND company_id = get_user_company_id())
    OR user_id = auth.uid()
  );

CREATE POLICY "Company members can update vendors"
  ON vendors FOR UPDATE
  TO authenticated
  USING (
    (company_id IS NOT NULL AND company_id = get_user_company_id())
    OR user_id = auth.uid()
  )
  WITH CHECK (
    (company_id IS NOT NULL AND company_id = get_user_company_id())
    OR user_id = auth.uid()
  );

CREATE POLICY "Company admins can delete vendors"
  ON vendors FOR DELETE
  TO authenticated
  USING (
    (
      company_id IS NOT NULL
      AND company_id = get_user_company_id()
      AND EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
    OR user_id = auth.uid()
  );

-- ============================================================
-- RLS POLICIES — invoices
-- ============================================================
CREATE POLICY "Company members can view invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Company members can insert invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Company members can update invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Company admins can delete invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- RLS POLICIES — risk_flags
-- ============================================================
CREATE POLICY "Company members can view risk flags"
  ON risk_flags FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = risk_flags.invoice_id
        AND invoices.company_id = get_user_company_id()
    )
  );

CREATE POLICY "Company members can insert risk flags"
  ON risk_flags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = risk_flags.invoice_id
        AND invoices.company_id = get_user_company_id()
    )
  );

CREATE POLICY "Company members can update risk flags"
  ON risk_flags FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = risk_flags.invoice_id
        AND invoices.company_id = get_user_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = risk_flags.invoice_id
        AND invoices.company_id = get_user_company_id()
    )
  );

CREATE POLICY "Company admins can delete risk flags"
  ON risk_flags FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = risk_flags.invoice_id
        AND invoices.company_id = get_user_company_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- RLS POLICIES — upload_sessions
-- ============================================================
CREATE POLICY "Company members can view upload sessions"
  ON upload_sessions FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can view own upload sessions"
  ON upload_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Company members can insert upload sessions"
  ON upload_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND user_id = auth.uid()
  );

-- ============================================================
-- SIGNUP TRIGGER — auto-create users row
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Insert into users table (new multi-tenant table)
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'member')
  ON CONFLICT (id) DO NOTHING;

  -- Also maintain the existing profiles table
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
