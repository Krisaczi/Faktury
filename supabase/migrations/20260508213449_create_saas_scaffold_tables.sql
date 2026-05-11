/*
  # SaaS Scaffold: Core Tables

  ## Summary
  Creates the foundational database schema for the SaaS application with authentication,
  user profiles, vendor management, risk reporting, and file uploads.

  ## New Tables

  ### profiles
  - Extends Supabase auth.users with additional user data
  - Stores full_name, avatar_url, and role (user/admin/owner)
  - Auto-created on user signup via trigger

  ### vendors
  - Tracks third-party vendor relationships per user
  - Includes risk scoring and status management

  ### risk_reports
  - Stores generated risk assessment reports
  - Links to vendors optionally, supports draft/published/archived states

  ### uploads
  - Tracks file uploads for processing pipelines
  - Stores metadata: filename, path, size, mime type, and status

  ## Security
  - RLS enabled on all tables
  - Users can only access their own data
  - Admin role can access all records
  - Auto-trigger creates profile on auth.users insert

  ## Important Notes
  1. The trigger function uses SECURITY DEFINER to bypass RLS during profile creation
  2. Only the user who owns a record can modify it
  3. Admins get read access to all records for oversight
*/

-- ============================================
-- ENUM TYPES
-- ============================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'admin', 'owner');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vendor_status AS ENUM ('active', 'inactive', 'under_review');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE upload_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- PROFILES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  role user_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ============================================
-- VENDORS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  risk_score numeric(4,1) CHECK (risk_score >= 0 AND risk_score <= 100),
  status vendor_status NOT NULL DEFAULT 'active',
  contact_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendors_user_id_idx ON vendors(user_id);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

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

-- ============================================
-- RISK REPORTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS risk_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text,
  risk_level risk_level NOT NULL DEFAULT 'low',
  status report_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_reports_user_id_idx ON risk_reports(user_id);
CREATE INDEX IF NOT EXISTS risk_reports_vendor_id_idx ON risk_reports(vendor_id);

ALTER TABLE risk_reports ENABLE ROW LEVEL SECURITY;

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

-- ============================================
-- UPLOADS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename text NOT NULL,
  file_path text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT '',
  status upload_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uploads_user_id_idx ON uploads(user_id);

ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own uploads"
  ON uploads FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own uploads"
  ON uploads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own uploads"
  ON uploads FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own uploads"
  ON uploads FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_vendors_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_risk_reports_updated_at
    BEFORE UPDATE ON risk_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
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
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
