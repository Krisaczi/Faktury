/*
  # SaaS Scaffold Database Schema

  ## Summary
  Initial schema for the SaaS application with four core tables.

  ## New Tables

  ### 1. profiles
  - `id` (uuid, PK) - References auth.users
  - `email` (text) - User email address
  - `full_name` (text) - Display name
  - `avatar_url` (text) - Profile picture URL
  - `company` (text) - Company name
  - `role` (text) - User role within organization
  - `created_at` / `updated_at` (timestamptz)

  ### 2. invoices
  - `id` (uuid, PK)
  - `user_id` (uuid) - FK to auth.users
  - `invoice_number` (text) - Human-readable invoice ID
  - `vendor_id` (uuid) - FK to vendors
  - `amount` (numeric) - Invoice total amount
  - `currency` (text) - Currency code (default PLN)
  - `status` (text) - pending | paid | overdue | cancelled
  - `issue_date` / `due_date` / `paid_date` (date)
  - `description` (text)
  - `created_at` / `updated_at` (timestamptz)

  ### 3. vendors
  - `id` (uuid, PK)
  - `user_id` (uuid) - FK to auth.users
  - `name` (text) - Vendor company name
  - `tax_id` (text) - NIP / Tax identification number
  - `email` (text)
  - `phone` (text)
  - `address` (text)
  - `status` (text) - active | inactive | blocked
  - `risk_score` (numeric 0-100) - Computed risk score
  - `created_at` / `updated_at` (timestamptz)

  ### 4. risk_reports
  - `id` (uuid, PK)
  - `user_id` (uuid) - FK to auth.users
  - `vendor_id` (uuid) - FK to vendors
  - `report_type` (text) - financial | compliance | operational
  - `score` (numeric 0-100) - Overall risk score
  - `findings` (jsonb) - Structured findings object
  - `status` (text) - draft | completed | reviewed
  - `generated_at` (timestamptz)
  - `created_at` / `updated_at` (timestamptz)

  ## Security
  - RLS enabled on all tables
  - Users can only read/write their own data
  - Separate policies for SELECT, INSERT, UPDATE, DELETE
*/

-- PROFILES TABLE
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text DEFAULT '',
  avatar_url text DEFAULT '',
  company text DEFAULT '',
  role text DEFAULT 'member',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete own profile"
  ON profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- VENDORS TABLE
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  tax_id text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  address text DEFAULT '',
  status text DEFAULT 'active',
  risk_score numeric(5,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS vendors_user_id_idx ON vendors(user_id);

CREATE POLICY "Users can view own vendors"
  ON vendors FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vendors"
  ON vendors FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vendors"
  ON vendors FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own vendors"
  ON vendors FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- INVOICES TABLE
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  amount numeric(12,2) DEFAULT 0,
  currency text DEFAULT 'PLN',
  status text DEFAULT 'pending',
  issue_date date,
  due_date date,
  paid_date date,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS invoices_user_id_idx ON invoices(user_id);
CREATE INDEX IF NOT EXISTS invoices_vendor_id_idx ON invoices(vendor_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);

CREATE POLICY "Users can view own invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RISK_REPORTS TABLE
CREATE TABLE IF NOT EXISTS risk_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  report_type text DEFAULT 'financial',
  score numeric(5,2) DEFAULT 0,
  findings jsonb DEFAULT '{}',
  status text DEFAULT 'draft',
  generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE risk_reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS risk_reports_user_id_idx ON risk_reports(user_id);
CREATE INDEX IF NOT EXISTS risk_reports_vendor_id_idx ON risk_reports(vendor_id);

CREATE POLICY "Users can view own risk reports"
  ON risk_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own risk reports"
  ON risk_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own risk reports"
  ON risk_reports FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own risk reports"
  ON risk_reports FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- AUTO-CREATE PROFILE ON USER SIGNUP
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();
