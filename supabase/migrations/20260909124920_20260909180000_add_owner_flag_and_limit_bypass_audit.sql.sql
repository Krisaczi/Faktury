/*
# Add is_owner flag, owner_user_id, and limit_bypass_audit table

1. New Columns
- `users.is_owner` (boolean, default false) — durable flag marking the single platform owner
- `companies.owner_user_id` (uuid, nullable) — associates a company with its owner user

2. New Tables
- `limit_bypass_audit` — audit trail for every limit check that was bypassed for the owner
  - id (uuid PK)
  - user_id (uuid, FK to users)
  - action (text) — what action was attempted (e.g. "create_invoice", "create_vendor")
  - bypassed_limit (text) — which limit was bypassed (e.g. "invoices_per_month", "vendors_limit")
  - reason (text) — why the bypass was applied (e.g. "owner_exempt")
  - payload (jsonb) — original limit check result and additional context
  - ip (text, nullable)
  - created_at (timestamptz, default now())

3. Backfill
- Set is_owner = true for the user with email 'krisaczi@yahoo.com'
- Set companies.owner_user_id for the company named 'KrisAczi' to that user's id
- Safety check: only set is_owner if exactly one user has that email (prevents mass assignment)

4. Security
- RLS enabled on limit_bypass_audit
- Owner-only SELECT (auth.uid() = user_id)
- Owner-only INSERT (auth.uid() = user_id)
- No UPDATE or DELETE policies (immutable audit log)

5. Rollback
- ALTER TABLE users DROP COLUMN IF EXISTS is_owner;
- ALTER TABLE companies DROP COLUMN IF EXISTS owner_user_id;
- DROP TABLE IF EXISTS limit_bypass_audit;
*/

-- 1. Add is_owner column to users
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_owner') THEN
    ALTER TABLE users ADD COLUMN is_owner boolean DEFAULT false;
  END IF;
END $$;

-- 2. Add owner_user_id column to companies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'owner_user_id') THEN
    ALTER TABLE companies ADD COLUMN owner_user_id uuid;
  END IF;
END $$;

-- 3. Safety check: count users with this email to prevent mass assignment
DO $$
DECLARE
  owner_count int;
  owner_id uuid;
BEGIN
  SELECT count(*) INTO owner_count FROM users WHERE email = 'krisaczi@yahoo.com';

  IF owner_count = 1 THEN
    SELECT id INTO owner_id FROM users WHERE email = 'krisaczi@yahoo.com' LIMIT 1;

    -- Set is_owner flag
    UPDATE users SET is_owner = true WHERE id = owner_id;

    -- Associate company 'KrisAczi' with this owner
    UPDATE companies
    SET owner_user_id = owner_id
    WHERE name = 'KrisAczi' AND owner_user_id IS NULL;

    RAISE NOTICE 'Owner backfill complete: user % marked as owner, company KrisAczi associated', owner_id;
  ELSIF owner_count > 1 THEN
    RAISE WARNING 'Multiple users found with email krisaczi@yahoo.com (%). Skipping is_owner backfill for safety.', owner_count;
  ELSE
    RAISE WARNING 'No user found with email krisaczi@yahoo.com. Skipping is_owner backfill.';
  END IF;
END $$;

-- 4. Create limit_bypass_audit table
CREATE TABLE IF NOT EXISTS limit_bypass_audit (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action         text NOT NULL,
  bypassed_limit text NOT NULL,
  reason         text NOT NULL DEFAULT 'owner_exempt',
  payload        jsonb,
  ip             text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Index for querying by user
CREATE INDEX IF NOT EXISTS idx_limit_bypass_audit_user_id ON limit_bypass_audit(user_id, created_at DESC);

-- 5. RLS on limit_bypass_audit
ALTER TABLE limit_bypass_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_bypass_audit" ON limit_bypass_audit;
CREATE POLICY "select_own_bypass_audit" ON limit_bypass_audit
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_bypass_audit" ON limit_bypass_audit;
CREATE POLICY "insert_own_bypass_audit" ON limit_bypass_audit
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Grant privileges
GRANT SELECT, INSERT ON limit_bypass_audit TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
