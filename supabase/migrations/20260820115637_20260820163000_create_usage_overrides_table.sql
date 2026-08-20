/*
# Create usage_overrides table for owner limit overrides

## Purpose
Stores owner-granted temporary limit overrides for companies that exceed
their plan limits. Used by the owner override-limits endpoint.

## Changes
- New table: usage_overrides
  - id (uuid PK)
  - company_id (uuid, FK to companies)
  - granted_by (uuid, FK to users)
  - extra_users (int, default 0)
  - extra_invoices (int, default 0)
  - extra_vendors (int, default 0)
  - expires_at (timestamptz, nullable)
  - reason (text, nullable)
  - active (boolean, default true)
  - created_at (timestamptz, default now())
  - updated_at (timestamptz, default now())
- RLS: owner-only CRUD
*/

CREATE TABLE IF NOT EXISTS usage_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  granted_by      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  extra_users     int NOT NULL DEFAULT 0,
  extra_invoices  int NOT NULL DEFAULT 0,
  extra_vendors   int NOT NULL DEFAULT 0,
  expires_at      timestamptz,
  reason          text,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_overrides_company_idx ON usage_overrides(company_id);
CREATE INDEX IF NOT EXISTS usage_overrides_active_idx ON usage_overrides(active) WHERE active = true;

ALTER TABLE usage_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_usage_overrides_owner" ON usage_overrides;
CREATE POLICY "select_usage_overrides_owner"
  ON usage_overrides FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'));

DROP POLICY IF EXISTS "insert_usage_overrides_owner" ON usage_overrides;
CREATE POLICY "insert_usage_overrides_owner"
  ON usage_overrides FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'));

DROP POLICY IF EXISTS "update_usage_overrides_owner" ON usage_overrides;
CREATE POLICY "update_usage_overrides_owner"
  ON usage_overrides FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'));

DROP POLICY IF EXISTS "delete_usage_overrides_owner" ON usage_overrides;
CREATE POLICY "delete_usage_overrides_owner"
  ON usage_overrides FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'));
