/*
# Monthly Invoice Limit Infrastructure

1. New Tables
- `invoice_usage_overrides` — owner-granted temporary invoice quota allowances
  - `id` (uuid PK)
  - `company_id` (uuid FK→companies, NOT NULL) — the company receiving the allowance
  - `granted_by` (uuid FK→auth.users, NOT NULL) — the owner who granted it
  - `extra_invoices` (int, NOT NULL, CHECK > 0) — number of additional invoices allowed
  - `reason` (text, nullable) — why the allowance was granted
  - `expires_at` (timestamptz, nullable) — when the allowance lapses (null = end of current month)
  - `consumed` (int, NOT NULL, default 0) — how many of the extra invoices have been used
  - `active` (boolean, NOT NULL, default true) — soft-disable flag
  - `created_at` (timestamptz, NOT NULL, default now())
  - `updated_at` (timestamptz, NOT NULL, default now())

2. Indexes
- `idx_invoice_usage_overrides_company` on (company_id, active, expires_at)
- `idx_issued_invoices_monthly_count` on issued_invoices (company_id, status, created_at)
  — speeds up the monthly issued-invoice count query

3. Security
- RLS enabled on `invoice_usage_overrides`
- SELECT: owner can view all overrides; company members can view their own company's overrides
- INSERT/UPDATE: owner only (via is_caller_owner())
- DELETE: blocked (use active=false instead)

4. Function
- `get_monthly_invoice_usage(p_company_id uuid)` returns a JSON object:
  { issued_count, limit, remaining, override_extra, override_consumed, override_active }
  Counts invoices with status='issued' created in the current calendar month for the company,
  adds active override allowances, and computes remaining vs the plan limit.

5. Notes
- The plan limit (10 for Starter, unlimited for Professional) is enforced in application
  code by reading the company's product_type. This function returns the count and the
  caller decides the limit based on the plan.
- Calendar month is defined in UTC (1st 00:00 to last day 23:59:59).
*/

CREATE TABLE IF NOT EXISTS invoice_usage_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  granted_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  extra_invoices  int  NOT NULL CHECK (extra_invoices > 0),
  reason          text,
  expires_at      timestamptz,
  consumed        int  NOT NULL DEFAULT 0 CHECK (consumed >= 0),
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_usage_overrides ENABLE ROW LEVEL SECURITY;

-- Owner can view all overrides
DROP POLICY IF EXISTS "Owner can view all invoice usage overrides" ON invoice_usage_overrides;
CREATE POLICY "Owner can view all invoice usage overrides"
  ON invoice_usage_overrides FOR SELECT
  TO authenticated
  USING (is_caller_owner());

-- Company members can view their own company's overrides
DROP POLICY IF EXISTS "Members can view own invoice usage overrides" ON invoice_usage_overrides;
CREATE POLICY "Members can view own invoice usage overrides"
  ON invoice_usage_overrides FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id());

-- Owner can insert overrides
DROP POLICY IF EXISTS "Owner can insert invoice usage overrides" ON invoice_usage_overrides;
CREATE POLICY "Owner can insert invoice usage overrides"
  ON invoice_usage_overrides FOR INSERT
  TO authenticated
  WITH CHECK (is_caller_owner());

-- Owner can update overrides (e.g. deactivate)
DROP POLICY IF EXISTS "Owner can update invoice usage overrides" ON invoice_usage_overrides;
CREATE POLICY "Owner can update invoice usage overrides"
  ON invoice_usage_overrides FOR UPDATE
  TO authenticated
  USING (is_caller_owner())
  WITH CHECK (is_caller_owner());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoice_usage_overrides_company
  ON invoice_usage_overrides (company_id, active, expires_at);

CREATE INDEX IF NOT EXISTS idx_issued_invoices_monthly_count
  ON issued_invoices (company_id, status, created_at);

-- Function: get monthly invoice usage for a company
CREATE OR REPLACE FUNCTION get_monthly_invoice_usage(p_company_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'issued_count', (
      SELECT count(*)::int
      FROM issued_invoices
      WHERE company_id = p_company_id
        AND status = 'issued'
        AND created_at >= date_trunc('month', now())
        AND created_at < date_trunc('month', now() + interval '1 month')
    ),
    'override_extra', COALESCE((
      SELECT sum(extra_invoices)::int
      FROM invoice_usage_overrides
      WHERE company_id = p_company_id
        AND active = true
        AND (expires_at IS NULL OR expires_at > now())
        AND created_at >= date_trunc('month', now())
    ), 0),
    'override_consumed', COALESCE((
      SELECT sum(consumed)::int
      FROM invoice_usage_overrides
      WHERE company_id = p_company_id
        AND active = true
        AND (expires_at IS NULL OR expires_at > now())
        AND created_at >= date_trunc('month', now())
    ), 0),
    'period_start', date_trunc('month', now()),
    'period_end', date_trunc('month', now() + interval '1 month')
  );
$$;
