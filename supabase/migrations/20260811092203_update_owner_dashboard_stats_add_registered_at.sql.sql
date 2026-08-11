/*
# Update get_owner_dashboard_stats RPC to return registered_at

## Purpose
Add `registered_at` to the Owner Dashboard company list query so the
frontend can display the Registration Date column. Also removes
`product_type` from the return signature since the Produkt column is being
replaced by Registration Date.

## Changes
- DROP and recreate `get_owner_dashboard_stats`:
  - ADD `registered_at timestamptz` to RETURNS TABLE and SELECT
  - REMOVE `product_type text` from RETURNS TABLE and SELECT
- All other columns and joins remain unchanged.

## Security
- Function remains SECURITY DEFINER, STABLE, search_path = 'public'
- Owner-only access enforced by the `requireOwnerUser()` server action.
*/

DROP FUNCTION IF EXISTS public.get_owner_dashboard_stats();

CREATE OR REPLACE FUNCTION public.get_owner_dashboard_stats()
RETURNS TABLE(
  company_id uuid,
  company_name text,
  nip text,
  is_active boolean,
  inactive_reason text,
  pricing_tier_name text,
  pricing_tier_id uuid,
  custom_pricing jsonb,
  subscription_status text,
  plan text,
  registered_at timestamp with time zone,
  created_at timestamp with time zone,
  invoices_30d bigint,
  invoices_90d bigint,
  invoices_365d bigint,
  net_total_30d numeric,
  gross_total_30d numeric,
  last_invoice_date date,
  vendors_count bigint,
  users_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    c.plan,
    c.registered_at,
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
$function$;
