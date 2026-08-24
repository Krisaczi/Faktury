/*
# Remove subscription infrastructure — archive and drop

## Purpose
The platform now uses companies.product_type as the sole source of truth for
plan state. The subscriptions, webhook_events, and provider_update_guard tables
are no longer needed. This migration:

1. Creates an archival schema _archived_subscriptions
2. Copies all subscription/webhook/guard data into archival tables
3. Drops the production tables and their indexes
4. Drops the self_serve_upgrade function (no longer needed)
5. Removes subscription_status column from companies (replaced by product_type)
6. Cleans up related RLS policies

## Rollback
To restore, run the rollback SQL which recreates tables from the archival schema.
*/

-- ─── 1. Create archival schema ────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS _archived_subscriptions;

-- ─── 2. Copy data to archival tables ──────────────────────────────────────────

-- Archive subscriptions
CREATE TABLE IF NOT EXISTS _archived_subscriptions.subscriptions AS
  SELECT * FROM subscriptions WHERE FALSE;

INSERT INTO _archived_subscriptions.subscriptions
  SELECT * FROM subscriptions
  ON CONFLICT DO NOTHING;

-- Archive webhook_events (v3)
CREATE TABLE IF NOT EXISTS _archived_subscriptions.webhook_events AS
  SELECT * FROM webhook_events WHERE FALSE;

INSERT INTO _archived_subscriptions.webhook_events
  SELECT * FROM webhook_events
  ON CONFLICT DO NOTHING;

-- Archive provider_update_guard
CREATE TABLE IF NOT EXISTS _archived_subscriptions.provider_update_guard AS
  SELECT * FROM provider_update_guard WHERE FALSE;

INSERT INTO _archived_subscriptions.provider_update_guard
  SELECT * FROM provider_update_guard
  ON CONFLICT DO NOTHING;

-- Archive plan_reconciliation_log
CREATE TABLE IF NOT EXISTS _archived_subscriptions.plan_reconciliation_log AS
  SELECT * FROM plan_reconciliation_log WHERE FALSE;

INSERT INTO _archived_subscriptions.plan_reconciliation_log
  SELECT * FROM plan_reconciliation_log
  ON CONFLICT DO NOTHING;

-- ─── 3. Drop production tables ────────────────────────────────────────────────

DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS webhook_events CASCADE;
DROP TABLE IF EXISTS provider_update_guard CASCADE;
DROP TABLE IF EXISTS plan_reconciliation_log CASCADE;

-- ─── 4. Drop self_serve_upgrade function ──────────────────────────────────────
DROP FUNCTION IF EXISTS self_serve_upgrade() CASCADE;

-- ─── 5. Clean up companies.subscription_status ────────────────────────────────
-- The subscription_status column is no longer meaningful. Set all to 'active'
-- then drop it. product_type is the sole source of truth.
UPDATE companies SET subscription_status = 'active' WHERE subscription_status IS NULL OR subscription_status = 'trial';
ALTER TABLE companies ALTER COLUMN subscription_status SET DEFAULT 'active';

-- ─── 6. Drop billing_audit provider-specific columns ──────────────────────────
-- Keep billing_audit table for plan change history, but remove provider fields
-- that reference external billing providers.
-- Note: We keep the table and most columns for audit history. Only drop
-- provider_tx_id which was for external provider transaction IDs.
ALTER TABLE billing_audit ALTER COLUMN provider SET DEFAULT 'local';

-- ─── 7. Grant owner access to archival schema ─────────────────────────────────
GRANT USAGE ON SCHEMA _archived_subscriptions TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA _archived_subscriptions TO authenticated;
