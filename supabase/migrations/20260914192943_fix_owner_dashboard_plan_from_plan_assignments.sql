/*
# Fix owner dashboard to read plan from plan_assignments

## Problem
The `get_owner_dashboard_stats` RPC reads `c.plan` from the `companies` table,
which can become stale. The canonical plan source is `plan_assignments` (one
active row per company). Companies with a `plan_assignments` entry of
`professional` were still showing `starter` in the dashboard because
`companies.plan` was never updated.

## Changes
1. Dropped and recreated `get_owner_dashboard_stats` to LEFT JOIN
   `plan_assignments` and use `COALESCE(pa.plan_id, c.plan, 'starter')` as
   the plan column.
2. Also surfaces `plan_changed_at` from `plan_assignments.updated_at` when
   the canonical source is used, falling back to `c.plan_changed_at`.
*/

DROP FUNCTION IF EXISTS public.get_owner_dashboard_stats();

CREATE FUNCTION public.get_owner_dashboard_stats()
RETURNS TABLE (
  company_id          uuid,
  company_name        text,
  nip                 text,
  is_active           boolean,
  inactive_reason     text,
  pricing_tier_name   text,
  pricing_tier_id     text,
  custom_pricing      jsonb,
  subscription_status text,
  plan                text,
  registered_at       timestamptz,
  created_at          timestamptz,
  invoices_30d        bigint,
  invoices_90d        bigint,
  invoices_365d       bigint,
  net_total_30d       numeric,
  gross_total_30d     numeric,
  last_invoice_date   date,
  vendors_count       bigint,
  users_count         bigint,
  plan_changed_at     timestamptz,
  plan_changed_by     uuid
)
LANGUAGE sql
STABLE
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
    COALESCE(pa.plan_id, c.plan, 'starter')                       AS plan,
    c.registered_at,
    c.created_at,

    COUNT(DISTINCT ii.id) FILTER (WHERE ii.issue_date >= CURRENT_DATE - INTERVAL '30 days')  AS invoices_30d,
    COUNT(DISTINCT ii.id) FILTER (WHERE ii.issue_date >= CURRENT_DATE - INTERVAL '90 days')  AS invoices_90d,
    COUNT(DISTINCT ii.id) FILTER (WHERE ii.issue_date >= CURRENT_DATE - INTERVAL '365 days') AS invoices_365d,

    COALESCE(SUM(ii.net_total)   FILTER (WHERE ii.issue_date >= CURRENT_DATE - INTERVAL '30 days'), 0) AS net_total_30d,
    COALESCE(SUM(ii.gross_total) FILTER (WHERE ii.issue_date >= CURRENT_DATE - INTERVAL '30 days'), 0) AS gross_total_30d,

    MAX(ii.issue_date)::date                                      AS last_invoice_date,
    COUNT(DISTINCT v.id)                                          AS vendors_count,
    COUNT(DISTINCT u.id)                                          AS users_count,

    COALESCE(pa.updated_at, c.plan_changed_at)                   AS plan_changed_at,
    c.plan_changed_by                                            AS plan_changed_by

  FROM public.companies c
  LEFT JOIN public.plan_assignments pa ON pa.entity_id = c.id AND pa.entity_type = 'company' AND pa.status = 'active'
  LEFT JOIN public.pricing_tiers  pt ON pt.id = c.pricing_tier_id
  LEFT JOIN public.issued_invoices ii ON ii.company_id = c.id AND ii.status != 'cancelled'
  LEFT JOIN public.vendors         v  ON v.company_id  = c.id
  LEFT JOIN public.users           u  ON u.company_id  = c.id

  GROUP BY c.id, pt.name, pa.plan_id, pa.updated_at
  ORDER BY c.name;
$$;
