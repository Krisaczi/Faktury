/*
# Add company address audit table and address columns

## Purpose
Enable all company members to view and edit their company's address in Settings,
with audit logging and configurable edit policy.

## Changes
1. Add columns to `companies`:
   - `address_line2` (text, nullable) — second address line (suite, floor, etc.)
   - `state_region` (text, nullable) — state/voivodeship/region
   - `country` (text, default 'PL') — ISO 3166-1 alpha-2 country code
   - `address_edit_policy` (text, default 'members') — 'members' or 'admins'
   - `address_locked` (boolean, default false) — owner can lock edits

2. Create `company_address_audit` table:
   - Tracks every address change with before/after snapshots
   - Columns: id, company_id, changed_by, change_type, before, after, reason, ip, created_at
   - RLS: company members can view, any member can insert

3. Backfill `country` to 'PL' for existing companies that have a zip code
*/

-- Add address columns to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS state_region text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS country text DEFAULT 'PL';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address_edit_policy text DEFAULT 'members';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address_locked boolean DEFAULT false;

-- Backfill country for existing rows
UPDATE companies SET country = 'PL' WHERE country IS NULL;

-- Create company_address_audit table
CREATE TABLE IF NOT EXISTS company_address_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  changed_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  change_type text NOT NULL DEFAULT 'update' CHECK (change_type IN ('update', 'verify', 'revert', 'lock', 'unlock')),
  before      jsonb,
  after       jsonb,
  reason      text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_company_address_audit_company_id ON company_address_audit(company_id);
CREATE INDEX IF NOT EXISTS idx_company_address_audit_created_at ON company_address_audit(created_at DESC);

-- Enable RLS
ALTER TABLE company_address_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies: company members can view, any member can insert
DROP POLICY IF EXISTS "Members can view address audit" ON company_address_audit;
CREATE POLICY "Members can view address audit"
ON company_address_audit FOR SELECT
TO authenticated
USING (company_id = get_user_company_id());

DROP POLICY IF EXISTS "Members can insert address audit" ON company_address_audit;
CREATE POLICY "Members can insert address audit"
ON company_address_audit FOR INSERT
TO authenticated
WITH CHECK (company_id = get_user_company_id());

-- Grant privileges
GRANT SELECT, INSERT ON company_address_audit TO authenticated;
