/*
# Add company plan column and audit infrastructure

## Purpose
The Owner Dashboard's "Plan" column was always empty because:
1. `companies` had no `plan` column — plan was only derivable from
   `pricing_tier_id` (NULL for most companies) or `product_type` ('starter'/'professional').
2. The `get_owner_dashboard_stats` RPC did not return `product_type`.

This migration adds a dedicated `plan` column to `companies`, backfills it
from `product_type`, adds audit columns, and creates a `company_plan_audit`
table for tracking plan changes.

## Changes
1. ALTER TABLE `companies`:
   - Add `plan text NOT NULL DEFAULT 'starter'`
   - Add `plan_changed_at timestamptz`
   - Add `plan_changed_by uuid` (references auth.users)
2. CREATE TABLE `company_plan_audit`:
   - `id` uuid PK
   - `company_id` uuid NOT NULL (references companies)
   - `actor_id` uuid (references auth.users)
   - `old_plan` text
   - `new_plan` text
   - `reason` text
   - `created_at` timestamptz DEFAULT now()
3. Backfill `companies.plan` from `companies.product_type` for existing rows.
4. RLS on `company_plan_audit`: only authenticated users can read, only
   owner role can insert (plan changes are server-action driven).

## Security
- `company_plan_audit` is RLS-enabled with SELECT for authenticated users
  who are company members, and INSERT restricted to the server action
  (service-role bypasses RLS; the owner-only server action enforces authorization).
- No anon access to plan data.
*/

-- 1. Add plan columns to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter';

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS plan_changed_at timestamptz;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS plan_changed_by uuid;

-- 2. Backfill plan from product_type for existing companies
-- Maps: 'professional' -> 'pro', 'starter' -> 'starter', default -> 'starter'
UPDATE public.companies
SET plan = CASE
  WHEN product_type = 'professional' THEN 'pro'
  WHEN product_type = 'starter' THEN 'starter'
  ELSE 'starter'
END
WHERE plan IS NULL OR plan = 'starter' AND product_type = 'professional';

-- 3. Create company_plan_audit table
CREATE TABLE IF NOT EXISTS public.company_plan_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id uuid,
  old_plan text,
  new_plan text,
  reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.company_plan_audit ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can read audit entries for their own company
DROP POLICY IF EXISTS "select_company_plan_audit" ON public.company_plan_audit;
CREATE POLICY "select_company_plan_audit"
  ON public.company_plan_audit FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id()
  );

-- RLS: owner (global) can read all audit entries
DROP POLICY IF EXISTS "select_all_company_plan_audit_owner" ON public.company_plan_audit;
CREATE POLICY "select_all_company_plan_audit_owner"
  ON public.company_plan_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = 'owner'
    )
  );

-- INSERT: only owner role can insert (plan changes are owner-only)
DROP POLICY IF EXISTS "insert_company_plan_audit" ON public.company_plan_audit;
CREATE POLICY "insert_company_plan_audit"
  ON public.company_plan_audit FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = 'owner'
    )
  );

GRANT SELECT, INSERT ON public.company_plan_audit TO authenticated;
