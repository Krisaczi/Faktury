/*
  # Weekly Summary Infrastructure

  ## Purpose
  Provides the database layer for the /api/weekly-summary cron endpoint.

  ## New Tables
  1. `email_reports`
     - Audit log for every weekly summary email dispatched
     - Stores company_id, run timestamp, metrics snapshot, recipient, and send status
     - RLS: owners/admins can SELECT their company's records; service role inserts

  ## New Functions
  2. `get_weekly_summary(p_company_id, p_from, p_to)`
     - Returns aggregated invoice + risk metrics for the given company and date window
     - Runs as SECURITY DEFINER with explicit company_id param (no JWT dependency)
     - Safe for use from service-role cron context
     - Returns: invoices_scanned, high_risk_count, medium_risk_count, flagged_amount,
                top_vendors (JSONB array), top_flag_types (JSONB array),
                prev_week_invoices, prev_week_high_risk (for trend delta)

  ## Indexes
  - email_reports(company_id, created_at DESC) for per-company history queries

  ## Security
  - email_reports RLS: SELECT restricted to company owner/admin
  - INSERT performed exclusively by service role (no INSERT policy needed for regular users)
  - get_weekly_summary is SECURITY DEFINER but accepts explicit company_id —
    the API route is responsible for only passing authorised company IDs
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- email_reports audit table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_reports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- NULL when initiated by the cron system actor rather than a human
  actor_user_id uuid        REFERENCES users(id) ON DELETE SET NULL,
  recipient     text        NOT NULL,
  subject       text        NOT NULL DEFAULT '',
  status        text        NOT NULL DEFAULT 'sent'
                CHECK (status IN ('sent', 'failed', 'dry_run')),
  resend_id     text,
  period_from   timestamptz NOT NULL,
  period_to     timestamptz NOT NULL,
  metrics       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error_detail  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_reports_company_created_idx
  ON email_reports(company_id, created_at DESC);

ALTER TABLE email_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins can view email reports"
  ON email_reports FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- get_weekly_summary RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_weekly_summary(
  p_company_id uuid,
  p_from        timestamptz,
  p_to          timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_from        timestamptz;
  v_prev_to          timestamptz;
  v_invoices_scanned bigint;
  v_high_risk        bigint;
  v_medium_risk      bigint;
  v_low_risk         bigint;
  v_flagged_amount   numeric;
  v_top_vendors      jsonb;
  v_top_flag_types   jsonb;
  v_prev_invoices    bigint;
  v_prev_high_risk   bigint;
BEGIN
  v_prev_from := p_from - (p_to - p_from);
  v_prev_to   := p_from;

  -- Current-period aggregates
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE overall_risk = 'high'),
    COUNT(*) FILTER (WHERE overall_risk = 'medium'),
    COUNT(*) FILTER (WHERE overall_risk = 'low'),
    COALESCE(
      SUM(COALESCE(total_amount, amount))
        FILTER (WHERE EXISTS (
          SELECT 1 FROM risk_flags rf WHERE rf.invoice_id = i.id
        )),
      0
    )
  INTO
    v_invoices_scanned, v_high_risk, v_medium_risk, v_low_risk, v_flagged_amount
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.created_at >= p_from
    AND i.created_at <  p_to;

  -- Top 5 flagged vendors
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'vendor_name',   v.name,
        'invoice_count', cnt.invoice_count,
        'high_risk',     cnt.high_risk
      )
      ORDER BY cnt.high_risk DESC, cnt.invoice_count DESC
    ),
    '[]'::jsonb
  )
  INTO v_top_vendors
  FROM (
    SELECT
      i.vendor_id,
      COUNT(*)                                          AS invoice_count,
      COUNT(*) FILTER (WHERE i.overall_risk = 'high')  AS high_risk
    FROM invoices i
    WHERE i.company_id = p_company_id
      AND i.created_at >= p_from
      AND i.created_at <  p_to
      AND i.vendor_id  IS NOT NULL
    GROUP BY i.vendor_id
    ORDER BY high_risk DESC, invoice_count DESC
    LIMIT 5
  ) cnt
  LEFT JOIN vendors v ON v.id = cnt.vendor_id;

  -- Top 5 flag types
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('type', flag_counts.type, 'count', flag_counts.cnt)
      ORDER BY flag_counts.cnt DESC
    ),
    '[]'::jsonb
  )
  INTO v_top_flag_types
  FROM (
    SELECT rf.type, COUNT(*) AS cnt
    FROM risk_flags rf
    JOIN invoices   i  ON i.id = rf.invoice_id
    WHERE i.company_id = p_company_id
      AND i.created_at >= p_from
      AND i.created_at <  p_to
    GROUP BY rf.type
    ORDER BY cnt DESC
    LIMIT 5
  ) flag_counts;

  -- Previous-period counts for trend delta
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE overall_risk = 'high')
  INTO v_prev_invoices, v_prev_high_risk
  FROM invoices
  WHERE company_id = p_company_id
    AND created_at >= v_prev_from
    AND created_at <  v_prev_to;

  RETURN jsonb_build_object(
    'invoices_scanned',    v_invoices_scanned,
    'high_risk_count',     v_high_risk,
    'medium_risk_count',   v_medium_risk,
    'low_risk_count',      v_low_risk,
    'flagged_amount',      v_flagged_amount,
    'top_vendors',         v_top_vendors,
    'top_flag_types',      v_top_flag_types,
    'prev_week_invoices',  v_prev_invoices,
    'prev_week_high_risk', v_prev_high_risk
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- pg_cron schedule (every Monday 08:00 UTC)
-- Schedules a pg_net HTTP POST to the Next.js API route.
-- Requires pg_cron + pg_net extensions and app.api_base_url / app.cron_secret
-- database settings. Skips gracefully if extensions are unavailable.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_cron_sql text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  -- Remove stale job if it exists so we can recreate cleanly
  BEGIN
    PERFORM cron.unschedule('weekly-summary-job');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  v_cron_sql :=
    'SELECT net.http_post(' ||
    '  url     := current_setting(''app.api_base_url'') || ''/api/weekly-summary'',' ||
    '  headers := jsonb_build_object(''Content-Type'', ''application/json'', ''x-cron-secret'', current_setting(''app.cron_secret'')),' ||
    '  body    := ''{}''::jsonb' ||
    ')';

  PERFORM cron.schedule('weekly-summary-job', '0 8 * * 1', v_cron_sql);

EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
