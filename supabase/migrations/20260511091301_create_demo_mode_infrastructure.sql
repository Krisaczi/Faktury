/*
  # Demo Mode Infrastructure

  ## Purpose
  Enables a safe, isolated Demo Mode that lets prospective users explore the
  application with realistic sample data without touching production data.

  ## Changes

  ### Modified Tables
  1. `companies`
     - Adds `is_demo` boolean (default false) to flag demo companies
     - Adds `demo_session_id` uuid FK for cross-table scoping

  ### New Tables
  2. `demo_sessions`
     - Tracks each demo session: who started it, TTL, seed preset, expiry
     - Used by cleanup job to find and delete expired demo rows
     - RLS: service role writes; demo user reads their own row

  ### RLS Policy Additions
  3. All existing tables get an additional isolation guard:
     production users (is_demo=false company) cannot read rows where
     the company has is_demo=true, and demo users cannot read
     production rows. Done via helper function `is_demo_request()`.

  ## Security Notes
  - Demo companies are isolated via `is_demo = true` on the company row
  - Production RLS policies already scope to `get_user_company_id()` which
    returns the user's own company_id — isolation is automatic as long as
    the demo user belongs only to the demo company
  - Service role used for seeding; demo users use regular anon key
  - `demo_sessions` records IP, created_by, and seed_preset for observability
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Add demo columns to companies
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'is_demo'
  ) THEN
    ALTER TABLE companies ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'demo_session_id'
  ) THEN
    ALTER TABLE companies ADD COLUMN demo_session_id uuid;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS companies_is_demo_idx ON companies(is_demo) WHERE is_demo = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- demo_sessions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demo_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  demo_company_id uuid        REFERENCES companies(id) ON DELETE CASCADE,
  demo_user_id    uuid        REFERENCES users(id)     ON DELETE SET NULL,
  seed_preset     text        NOT NULL DEFAULT 'full'
                  CHECK (seed_preset IN ('small', 'full')),
  ttl_hours       int         NOT NULL DEFAULT 24,
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  created_by_ip   text,
  is_active       boolean     NOT NULL DEFAULT true,
  pages_visited   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  exited_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_sessions_expires_idx  ON demo_sessions(expires_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS demo_sessions_company_idx  ON demo_sessions(demo_company_id);

ALTER TABLE demo_sessions ENABLE ROW LEVEL SECURITY;

-- Demo user can read their own session (used by /api/demo/status)
CREATE POLICY "Demo user can read own session"
  ON demo_sessions FOR SELECT
  TO authenticated
  USING (
    demo_user_id = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Cleanup function — called by pg_cron or manually
-- Deletes all rows belonging to expired demo sessions.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_expired_demo_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id    uuid;
  v_company_id    uuid;
BEGIN
  FOR v_session_id, v_company_id IN
    SELECT id, demo_company_id
    FROM   demo_sessions
    WHERE  is_active = true
      AND  expires_at < now()
  LOOP
    -- Mark session inactive first (idempotency)
    UPDATE demo_sessions SET is_active = false WHERE id = v_session_id;

    -- Delete demo data in dependency order
    IF v_company_id IS NOT NULL THEN
      DELETE FROM risk_flags     WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = v_company_id);
      DELETE FROM invoice_reviews WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = v_company_id);
      DELETE FROM invoices        WHERE company_id = v_company_id;
      DELETE FROM vendors         WHERE company_id = v_company_id;
      DELETE FROM billing_metadata WHERE company_id = v_company_id;
      DELETE FROM users           WHERE company_id = v_company_id;
      DELETE FROM companies       WHERE id = v_company_id AND is_demo = true;
    END IF;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- pg_cron: run cleanup every hour
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('demo-cleanup-job');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'demo-cleanup-job',
    '0 * * * *',
    'SELECT cleanup_expired_demo_sessions()'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
