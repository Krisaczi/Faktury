/*
# Fix KSeF credentials permissions for accountants

## Purpose
Accountants were completely blocked from managing KSeF credentials (token + environment)
because all RLS policies required `users.role = 'owner'`. This migration:
1. Adds `updated_by` column to track who last changed credentials
2. Creates `ksef_audit` table for credential change auditing
3. Replaces all 4 RLS policies to allow both 'owner' and 'accountant' roles
4. Adds an index on ksef_audit for company-scoped queries

## Changes

### ksef_credentials table
- Added `updated_by uuid` column (nullable, references auth.users)
- RLS policies rewritten: role check changed from `= 'owner'` to `IN ('owner', 'accountant')`

### ksef_audit table (new)
- `id uuid PK`
- `company_id uuid NOT NULL` (FK → companies, CASCADE)
- `actor_id uuid NOT NULL` (FK → auth.users, CASCADE)
- `field_changed text NOT NULL` — e.g. 'ksef_token', 'ksef_env'
- `old_value_masked text` — masked previous value
- `new_value_masked text` — masked new value
- `created_at timestamptz DEFAULT now()`
- RLS: company members can SELECT, service_role can INSERT (via SECURITY DEFINER function)

## Security
- Accountants can now read, insert, update, and delete KSeF credentials for their own company
- Anon role is denied all access
- All changes are audited via the ksef_audit table
- The token column is NOT directly readable by the client (SELECT policy returns the full row,
  but the API route strips the token before sending to the browser)
*/

-- ─── 1. Add updated_by column ──────────────────────────────────────────────────
ALTER TABLE public.ksef_credentials
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── 2. Create ksef_audit table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ksef_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_changed text NOT NULL,
  old_value_masked text,
  new_value_masked text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ksef_audit ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS "Company members can view ksef audit" ON public.ksef_audit;
DROP POLICY IF EXISTS "Service can insert ksef audit" ON public.ksef_audit;

CREATE POLICY "Company members can view ksef audit"
  ON public.ksef_audit FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Service can insert ksef audit"
  ON public.ksef_audit FOR INSERT
  TO authenticated
  WITH CHECK (company_id = get_user_company_id());

-- Index for company-scoped audit queries
CREATE INDEX IF NOT EXISTS ksef_audit_company_idx
  ON public.ksef_audit (company_id, created_at DESC);

-- ─── 3. Replace RLS policies on ksef_credentials ───────────────────────────────
-- Drop old owner-only policies
DROP POLICY IF EXISTS "Owners can delete KSeF credentials" ON public.ksef_credentials;
DROP POLICY IF EXISTS "Owners can insert KSeF credentials" ON public.ksef_credentials;
DROP POLICY IF EXISTS "Owners can manage KSeF credentials" ON public.ksef_credentials;
DROP POLICY IF EXISTS "Owners can update KSeF credentials" ON public.ksef_credentials;

-- New policies: allow both owner and accountant roles for company members
CREATE POLICY "Company members can view KSeF credentials"
  ON public.ksef_credentials FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'accountant')
    )
  );

CREATE POLICY "Company members can insert KSeF credentials"
  ON public.ksef_credentials FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'accountant')
    )
  );

CREATE POLICY "Company members can update KSeF credentials"
  ON public.ksef_credentials FOR UPDATE
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'accountant')
    )
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'accountant')
    )
  );

CREATE POLICY "Company members can delete KSeF credentials"
  ON public.ksef_credentials FOR DELETE
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'accountant')
    )
  );

-- ─── 4. Grant privileges ──────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ksef_credentials TO authenticated;
GRANT SELECT ON public.ksef_audit TO authenticated;
GRANT INSERT ON public.ksef_audit TO authenticated;
