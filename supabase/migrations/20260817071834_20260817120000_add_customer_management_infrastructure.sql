/*
# Add Customer Management Infrastructure for Invoice Issuing

## Purpose
The invoice-issuing flow currently uses free-text buyer fields. This migration
adds proper customer (buyer) selection by:
1. Adding `buyer_company_id` FK to `issued_invoices` so invoices reference
   a saved customer record (while keeping the denormalized snapshot fields).
2. Updating RLS on `buyer_companies` to allow accountants (not just owners)
   to create and manage customers — accountants issue invoices and need to
   add customers during that flow.
3. Creating a `customer_audit_log` table for logging customer creation
   events and validation failures, used by the admin diagnostics view.
4. Adding a `last_used_at` column to `buyer_companies` so the UI can sort
   most-recently-used customers first.

## Changes

### 1. issued_invoices table
- Add column `buyer_company_id` (uuid, nullable, FK to buyer_companies ON DELETE SET NULL).
- This is additive — existing invoices keep their free-text buyer fields.

### 2. buyer_companies table
- Add column `last_used_at` (timestamptz, nullable) for "recently used" sorting.
- Update RLS: allow accountants to INSERT and UPDATE (not just owners).
  - INSERT: company members where role is owner OR accountant.
  - UPDATE: same — owner or accountant of the same company.
  - SELECT: unchanged — all company members can read.

### 3. customer_audit_log table (new)
- `id` (uuid PK)
- `company_id` (FK → companies, cascade)
- `user_id` (FK → auth.users, cascade)
- `event_type` (text: 'created' | 'validation_failed' | 'duplicate_blocked')
- `customer_name` (text, nullable)
- `customer_nip` (text, nullable)
- `error_detail` (text, nullable)
- `created_at` (timestamptz default now())
- RLS: company members can SELECT; any company member can INSERT.

## Security
- All new policies use auth.uid() + company membership checks.
- No data is exposed to users outside the company.
- The customer_audit_log is insert-only for company members (no UPDATE/DELETE).
*/

-- ─── 1. Add buyer_company_id to issued_invoices ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issued_invoices' AND column_name = 'buyer_company_id'
  ) THEN
    ALTER TABLE issued_invoices
      ADD COLUMN buyer_company_id uuid REFERENCES buyer_companies(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 2. Add last_used_at to buyer_companies ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buyer_companies' AND column_name = 'last_used_at'
  ) THEN
    ALTER TABLE buyer_companies
      ADD COLUMN last_used_at timestamptz;
  END IF;
END $$;

-- Index for "recently used" sorting
CREATE INDEX IF NOT EXISTS idx_buyer_companies_last_used
  ON buyer_companies (company_id, last_used_at DESC NULLS LAST);

-- ─── 3. Update RLS on buyer_companies: allow accountants to create/edit ──────

-- Drop old INSERT policy (owner-only) and replace with owner-or-accountant
DROP POLICY IF EXISTS "insert_buyer_companies" ON buyer_companies;
DROP POLICY IF EXISTS "buyer_companies_insert_owner" ON buyer_companies;

CREATE POLICY "buyer_companies_insert_owner_or_accountant"
ON buyer_companies FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.company_id = buyer_companies.company_id
    AND u.role IN ('owner', 'accountant')
  )
);

-- Drop old UPDATE policy and replace
DROP POLICY IF EXISTS "update_buyer_companies" ON buyer_companies;
DROP POLICY IF EXISTS "buyer_companies_update_owner" ON buyer_companies;

CREATE POLICY "buyer_companies_update_owner_or_accountant"
ON buyer_companies FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.company_id = buyer_companies.company_id
    AND u.role IN ('owner', 'accountant')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.company_id = buyer_companies.company_id
    AND u.role IN ('owner', 'accountant')
  )
);

-- ─── 4. Create customer_audit_log table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type    text NOT NULL CHECK (event_type IN ('created', 'validation_failed', 'duplicate_blocked')),
  customer_name text,
  customer_nip  text,
  error_detail  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_audit_log ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customer_audit_company_created
  ON customer_audit_log (company_id, created_at DESC);

-- SELECT: company members can read their own audit logs
DROP POLICY IF EXISTS "select_customer_audit_log" ON customer_audit_log;
CREATE POLICY "select_customer_audit_log"
ON customer_audit_log FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.company_id = customer_audit_log.company_id
  )
);

-- INSERT: company members can create audit entries
DROP POLICY IF EXISTS "insert_customer_audit_log" ON customer_audit_log;
CREATE POLICY "insert_customer_audit_log"
ON customer_audit_log FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.company_id = customer_audit_log.company_id
  )
);

-- Grant privileges
GRANT SELECT, INSERT ON customer_audit_log TO authenticated;
GRANT SELECT, UPDATE ON buyer_companies TO authenticated;
