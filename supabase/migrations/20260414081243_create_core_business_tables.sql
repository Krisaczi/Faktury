/*
  # Core Business Tables

  ## Summary
  Creates the primary business domain tables for multi-tenant invoice and vendor
  risk management. Companies are the root tenant, users belong to a company,
  vendors and invoices are scoped per company, and risk_flags attach to invoices.

  ## Tables Created
  - companies — root tenant entity with KSeF credentials and subscription status
  - users — app users linked to auth.users, scoped to one company with a role
  - company_vendors — vendor/supplier records per company
  - company_invoices — invoice records fetched from KSeF or entered manually
  - risk_flags — individual risk signals attached to an invoice

  ## Security
  - RLS enabled on all tables
  - All data access is scoped to the authenticated user's company
  - Policies added after both companies and users tables exist to avoid FK ordering issues
*/

-- ============================================================
-- COMPANIES (no RLS policies yet — added after users table)
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL DEFAULT '',
  nip                    text DEFAULT '',
  currency               text DEFAULT 'PLN',
  ksef_token             text DEFAULT '',
  ksef_token_created_at  timestamptz,
  subscription_status    text DEFAULT 'trialing',
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text DEFAULT '',
  company_id  uuid REFERENCES companies(id) ON DELETE SET NULL,
  role        text DEFAULT 'member',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS users_company_id_idx ON users(company_id);

CREATE POLICY "Users can view own record"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own record"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own record"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete own record"
  ON users FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- ============================================================
-- COMPANIES — RLS policies (now that users table exists)
-- ============================================================
CREATE POLICY "Company members can view their company"
  ON companies FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Company members can insert their company"
  ON companies FOR INSERT
  TO authenticated
  WITH CHECK (
    id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Company members can update their company"
  ON companies FOR UPDATE
  TO authenticated
  USING (id IN (SELECT company_id FROM users WHERE id = auth.uid()))
  WITH CHECK (id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Company members can delete their company"
  ON companies FOR DELETE
  TO authenticated
  USING (id IN (SELECT company_id FROM users WHERE id = auth.uid()));

-- ============================================================
-- COMPANY_VENDORS
-- ============================================================
CREATE TABLE IF NOT EXISTS company_vendors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT '',
  nip           text DEFAULT '',
  bank_accounts text[] DEFAULT '{}',
  avg_amount    numeric(14,2) DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE company_vendors ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS company_vendors_company_id_idx ON company_vendors(company_id);

CREATE POLICY "Members can view company vendors"
  ON company_vendors FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Members can insert company vendors"
  ON company_vendors FOR INSERT
  TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Members can update company vendors"
  ON company_vendors FOR UPDATE
  TO authenticated
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Members can delete company vendors"
  ON company_vendors FOR DELETE
  TO authenticated
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

-- ============================================================
-- COMPANY_INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS company_invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_id        uuid REFERENCES company_vendors(id) ON DELETE SET NULL,
  ksef_reference   text DEFAULT '',
  invoice_number   text NOT NULL DEFAULT '',
  amount           numeric(14,2) DEFAULT 0,
  currency         text DEFAULT 'PLN',
  issue_date       date,
  due_date         date,
  bank_account     text DEFAULT '',
  xml_raw          text DEFAULT '',
  overall_risk     text DEFAULT 'low',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE company_invoices ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS company_invoices_company_id_idx   ON company_invoices(company_id);
CREATE INDEX IF NOT EXISTS company_invoices_vendor_id_idx    ON company_invoices(vendor_id);
CREATE INDEX IF NOT EXISTS company_invoices_overall_risk_idx ON company_invoices(overall_risk);
CREATE INDEX IF NOT EXISTS company_invoices_issue_date_idx   ON company_invoices(issue_date DESC);

CREATE POLICY "Members can view company invoices"
  ON company_invoices FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Members can insert company invoices"
  ON company_invoices FOR INSERT
  TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Members can update company invoices"
  ON company_invoices FOR UPDATE
  TO authenticated
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Members can delete company invoices"
  ON company_invoices FOR DELETE
  TO authenticated
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

-- ============================================================
-- RISK_FLAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS risk_flags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES company_invoices(id) ON DELETE CASCADE,
  type        text NOT NULL DEFAULT '',
  severity    text NOT NULL DEFAULT 'low',
  message     text DEFAULT '',
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE risk_flags ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS risk_flags_invoice_id_idx ON risk_flags(invoice_id);
CREATE INDEX IF NOT EXISTS risk_flags_severity_idx   ON risk_flags(severity);

CREATE POLICY "Members can view risk flags for their invoices"
  ON risk_flags FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM company_invoices
      WHERE company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Members can insert risk flags for their invoices"
  ON risk_flags FOR INSERT
  TO authenticated
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM company_invoices
      WHERE company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Members can update risk flags for their invoices"
  ON risk_flags FOR UPDATE
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM company_invoices
      WHERE company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM company_invoices
      WHERE company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Members can delete risk flags for their invoices"
  ON risk_flags FOR DELETE
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM company_invoices
      WHERE company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );
