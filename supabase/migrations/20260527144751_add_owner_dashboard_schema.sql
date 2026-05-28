/*
  # Owner Dashboard Schema

  ## Changes

  ### 1. Extend companies table
  - `is_active` boolean — whether the company is active (default true)
  - `inactive_reason` text — optional reason for deactivation
  - `inactive_at` timestamptz — when the company was deactivated
  - `pricing_tier_id` uuid — FK to pricing_tiers (nullable)
  - `custom_pricing` jsonb — custom pricing override

  ### 2. New table: pricing_tiers
  Defines subscription/pricing tiers available to companies.
  - `id`, `name`, `monthly_price_cents`, `annual_price_cents`, `limits`, timestamps

  ### 3. New table: owner_audit_logs
  Immutable audit trail for owner actions (activate/deactivate company, assign pricing).
  - `id`, `owner_id`, `action`, `company_id` (nullable), `previous`, `next`, `ip`, `created_at`

  ### 4. RPC: get_owner_dashboard_stats
  Returns per-company aggregate metrics for the owner dashboard in a single query.

  ## Security
  - RLS on pricing_tiers (public read for authenticated, owner-only write via service role)
  - RLS on owner_audit_logs (only the owner can read their own logs)
  - companies table already has RLS; new columns inherit existing policies
*/

-- ─── 1. Extend companies ──────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='is_active') THEN
    ALTER TABLE public.companies ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='inactive_reason') THEN
    ALTER TABLE public.companies ADD COLUMN inactive_reason text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='inactive_at') THEN
    ALTER TABLE public.companies ADD COLUMN inactive_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='pricing_tier_id') THEN
    ALTER TABLE public.companies ADD COLUMN pricing_tier_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='custom_pricing') THEN
    ALTER TABLE public.companies ADD COLUMN custom_pricing jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS companies_is_active_idx ON public.companies (is_active);

-- ─── 2. pricing_tiers ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pricing_tiers (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text        NOT NULL UNIQUE,
  monthly_price_cents  int         NOT NULL DEFAULT 0,
  annual_price_cents   int         NOT NULL DEFAULT 0,
  limits               jsonb       NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_tiers_name_idx ON public.pricing_tiers (name);

ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pricing tiers"
  ON public.pricing_tiers FOR SELECT
  TO authenticated
  USING (true);

-- Insert default tiers (idempotent)
INSERT INTO public.pricing_tiers (name, monthly_price_cents, annual_price_cents, limits)
VALUES
  ('Starter',      4900,  49000, '{"invoices_per_month": 50,   "users": 2,  "storage_gb": 1}'::jsonb),
  ('Professional', 14900, 149000, '{"invoices_per_month": 500,  "users": 10, "storage_gb": 10}'::jsonb),
  ('Enterprise',   49900, 499000, '{"invoices_per_month": null, "users": null, "storage_gb": 100}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- ─── 3. owner_audit_logs ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.owner_audit_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action      text        NOT NULL,
  company_id  uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  previous    jsonb,
  next        jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_audit_logs_owner_id_idx    ON public.owner_audit_logs (owner_id);
CREATE INDEX IF NOT EXISTS owner_audit_logs_company_id_idx  ON public.owner_audit_logs (company_id);
CREATE INDEX IF NOT EXISTS owner_audit_logs_created_at_idx  ON public.owner_audit_logs (created_at DESC);

ALTER TABLE public.owner_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read own audit logs"
  ON public.owner_audit_logs FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can insert own audit logs"
  ON public.owner_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- ─── 4. get_owner_dashboard_stats RPC ────────────────────────────────────────
-- Returns company list enriched with 30-day invoice aggregates for the owner dashboard.

CREATE OR REPLACE FUNCTION public.get_owner_dashboard_stats()
RETURNS TABLE (
  company_id            uuid,
  company_name          text,
  nip                   text,
  is_active             boolean,
  inactive_reason       text,
  pricing_tier_name     text,
  pricing_tier_id       uuid,
  custom_pricing        jsonb,
  subscription_status   text,
  created_at            timestamptz,
  invoices_30d          bigint,
  invoices_90d          bigint,
  invoices_365d         bigint,
  net_total_30d         numeric,
  gross_total_30d       numeric,
  last_invoice_date     date,
  vendors_count         bigint,
  users_count           bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id                                                          AS company_id,
    c.name                                                        AS company_name,
    c.nip,
    c.is_active,
    c.inactive_reason,
    pt.name                                                       AS pricing_tier_name,
    c.pricing_tier_id,
    c.custom_pricing,
    c.subscription_status,
    c.created_at,

    COUNT(DISTINCT ii.id) FILTER (WHERE ii.issue_date >= CURRENT_DATE - INTERVAL '30 days')  AS invoices_30d,
    COUNT(DISTINCT ii.id) FILTER (WHERE ii.issue_date >= CURRENT_DATE - INTERVAL '90 days')  AS invoices_90d,
    COUNT(DISTINCT ii.id) FILTER (WHERE ii.issue_date >= CURRENT_DATE - INTERVAL '365 days') AS invoices_365d,

    COALESCE(SUM(ii.net_total)   FILTER (WHERE ii.issue_date >= CURRENT_DATE - INTERVAL '30 days'), 0) AS net_total_30d,
    COALESCE(SUM(ii.gross_total) FILTER (WHERE ii.issue_date >= CURRENT_DATE - INTERVAL '30 days'), 0) AS gross_total_30d,

    MAX(ii.issue_date)::date                                      AS last_invoice_date,
    COUNT(DISTINCT v.id)                                          AS vendors_count,
    COUNT(DISTINCT u.id)                                          AS users_count

  FROM public.companies c
  LEFT JOIN public.pricing_tiers  pt ON pt.id = c.pricing_tier_id
  LEFT JOIN public.issued_invoices ii ON ii.company_id = c.id AND ii.status != 'cancelled'
  LEFT JOIN public.vendors         v  ON v.company_id  = c.id
  LEFT JOIN public.users           u  ON u.company_id  = c.id

  GROUP BY c.id, pt.name
  ORDER BY c.name;
$$;

-- ─── 5. get_owner_revenue_trend RPC ──────────────────────────────────────────
-- Monthly MRR-style trend across all companies, for owner dashboard chart.

CREATE OR REPLACE FUNCTION public.get_owner_revenue_trend(
  p_months int DEFAULT 12
)
RETURNS TABLE (
  month          text,
  total_invoices bigint,
  net_total      numeric,
  gross_total    numeric,
  active_companies bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', ii.issue_date), 'YYYY-MM') AS month,
    COUNT(*)                                                 AS total_invoices,
    COALESCE(SUM(ii.net_total),   0)                        AS net_total,
    COALESCE(SUM(ii.gross_total), 0)                        AS gross_total,
    COUNT(DISTINCT ii.company_id)                           AS active_companies
  FROM public.issued_invoices ii
  WHERE ii.issue_date >= CURRENT_DATE - (p_months || ' months')::interval
    AND ii.status != 'cancelled'
  GROUP BY 1
  ORDER BY 1;
$$;
