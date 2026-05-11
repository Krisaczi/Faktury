/*
  # Extend Upload Sessions and Add KSeF Credentials

  ## Summary
  Extends the upload pipeline to support XML file processing, KSeF integration,
  job status tracking, and encrypted KSeF credential storage per company.

  ## Changes

  ### upload_sessions table
  - Added: filename (text) — original filename or KSeF job label
  - Added: status (text) — 'pending' | 'processing' | 'completed' | 'failed'
  - Added: file_count (int) — number of files in this session
  - Added: invoices_created (int) — parsed invoice records created
  - Added: flags_created (int) — risk_flags created during parsing
  - Added: error_count (int) — XML/parsing errors encountered
  - Added: storage_path (text) — path prefix in Supabase Storage
  - Added: error_detail (jsonb) — structured error report array

  ### invoices table
  - Added: total_amount (numeric) — canonical total amount column (some schemas use 'amount')
  - Added: raw_file_url (text) — signed URL or path to raw uploaded file
  - Added: upload_session_id (uuid) — links invoice back to its upload session
  - Added: invoice_date (date) — alias for issue_date in KSeF XML format
  - Added: tax_amount (numeric) — VAT/tax amount from XML
  - Added: seller_nip (text) — seller NIP extracted from XML
  - Added: buyer_nip (text) — buyer NIP extracted from XML

  ### ksef_credentials (new table)
  - Stores per-company KSeF API tokens; restricted to owners only via RLS
  - Columns: id, company_id, token (encrypted at app layer), environment (test/prod), created_at, updated_at

  ### parse_jobs (new table)
  - Tracks async parsing jobs for polling
  - Columns: id, upload_session_id, status, progress, result (jsonb), created_at, updated_at

  ## Security
  - RLS on all new/modified tables
  - ksef_credentials restricted to company owners only
  - parse_jobs scoped to company via upload_session join
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend upload_sessions
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upload_sessions' AND column_name='filename') THEN
    ALTER TABLE upload_sessions ADD COLUMN filename text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upload_sessions' AND column_name='status') THEN
    ALTER TABLE upload_sessions ADD COLUMN status text NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','processing','completed','failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upload_sessions' AND column_name='file_count') THEN
    ALTER TABLE upload_sessions ADD COLUMN file_count int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upload_sessions' AND column_name='invoices_created') THEN
    ALTER TABLE upload_sessions ADD COLUMN invoices_created int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upload_sessions' AND column_name='flags_created') THEN
    ALTER TABLE upload_sessions ADD COLUMN flags_created int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upload_sessions' AND column_name='error_count') THEN
    ALTER TABLE upload_sessions ADD COLUMN error_count int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upload_sessions' AND column_name='storage_path') THEN
    ALTER TABLE upload_sessions ADD COLUMN storage_path text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upload_sessions' AND column_name='error_detail') THEN
    ALTER TABLE upload_sessions ADD COLUMN error_detail jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- auto-update updated_at for upload_sessions
DO $$ BEGIN
  CREATE TRIGGER update_upload_sessions_updated_at
    BEFORE UPDATE ON upload_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend invoices
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='total_amount') THEN
    ALTER TABLE invoices ADD COLUMN total_amount numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='raw_file_url') THEN
    ALTER TABLE invoices ADD COLUMN raw_file_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='upload_session_id') THEN
    ALTER TABLE invoices ADD COLUMN upload_session_id uuid REFERENCES upload_sessions(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='invoice_date') THEN
    ALTER TABLE invoices ADD COLUMN invoice_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='tax_amount') THEN
    ALTER TABLE invoices ADD COLUMN tax_amount numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='seller_nip') THEN
    ALTER TABLE invoices ADD COLUMN seller_nip text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='buyer_nip') THEN
    ALTER TABLE invoices ADD COLUMN buyer_nip text;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ksef_credentials
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ksef_credentials (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token        text        NOT NULL,
  environment  text        NOT NULL DEFAULT 'test' CHECK (environment IN ('test','prod')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ksef_credentials_company_env_idx
  ON ksef_credentials(company_id, environment);

ALTER TABLE ksef_credentials ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE TRIGGER update_ksef_credentials_updated_at
    BEFORE UPDATE ON ksef_credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE POLICY "Owners can manage KSeF credentials"
  ON ksef_credentials FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Owners can insert KSeF credentials"
  ON ksef_credentials FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Owners can update KSeF credentials"
  ON ksef_credentials FOR UPDATE
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Owners can delete KSeF credentials"
  ON ksef_credentials FOR DELETE
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- parse_jobs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parse_jobs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_session_id  uuid        NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
  status             text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','processing','completed','failed')),
  progress           int         NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  result             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parse_jobs_upload_session_idx ON parse_jobs(upload_session_id);

ALTER TABLE parse_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE TRIGGER update_parse_jobs_updated_at
    BEFORE UPDATE ON parse_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE POLICY "Company members can view parse jobs"
  ON parse_jobs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM upload_sessions us
      WHERE us.id = parse_jobs.upload_session_id
        AND us.company_id = get_user_company_id()
    )
  );

CREATE POLICY "Company members can insert parse jobs"
  ON parse_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM upload_sessions us
      WHERE us.id = parse_jobs.upload_session_id
        AND us.company_id = get_user_company_id()
    )
  );

CREATE POLICY "Company members can update parse jobs"
  ON parse_jobs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM upload_sessions us
      WHERE us.id = parse_jobs.upload_session_id
        AND us.company_id = get_user_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM upload_sessions us
      WHERE us.id = parse_jobs.upload_session_id
        AND us.company_id = get_user_company_id()
    )
  );
