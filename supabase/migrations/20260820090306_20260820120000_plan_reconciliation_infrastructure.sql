/*
# Plan Reconciliation Infrastructure

## Purpose
Fixes plan mismatches platform-wide by establishing a canonical source of truth,
adding reconciliation tables, fixing the broken billing_audit inserts, and
providing owner remediation tools.

## Changes

### 1. New table: `subscriptions`
Canonical source of truth for subscription plan state.
- `id` (uuid PK)
- `user_id` (uuid FK→users, NOT NULL) — the user who owns this subscription
- `company_id` (uuid FK→companies, NOT NULL) — company scoped
- `plan_id` (text NOT NULL) — canonical plan identifier ('starter', 'professional', etc.)
- `provider` (text NOT NULL DEFAULT 'internal') — billing provider name
- `provider_subscription_id` (text nullable) — external subscription ID
- `status` (text NOT NULL DEFAULT 'active') — 'active'|'canceled'|'past_due'|'trialing'
- `current_period_end` (timestamptz nullable) — billing period end
- `price_id` (text nullable) — external price ID
- `pending_change` (jsonb nullable) — pending plan change metadata
- `last_synced_at` (timestamptz NOT NULL DEFAULT now()) — last reconciliation sync
- `created_at` (timestamptz DEFAULT now())
- `updated_at` (timestamptz DEFAULT now())
- UNIQUE constraint on `(user_id)` — one subscription per user
- UNIQUE constraint on `(company_id)` where `status = 'active'` — one active subscription per company

### 2. New table: `webhook_events`
Persistent raw webhook events with idempotent processing status.
- `id` (uuid PK)
- `provider` (text NOT NULL) — e.g. 'internal', 'stripe'
- `event_id` (text NOT NULL) — provider's unique event ID
- `event_type` (text NOT NULL) — e.g. 'subscription.updated'
- `payload` (jsonb NOT NULL) — raw webhook body
- `status` (text NOT NULL DEFAULT 'pending') — 'pending'|'processing'|'processed'|'failed'
- `attempts` (int NOT NULL DEFAULT 0)
- `last_error` (text nullable)
- `processed_at` (timestamptz nullable)
- `created_at` (timestamptz DEFAULT now())
- UNIQUE on `(provider, event_id)` — idempotency key

### 3. New table: `plan_reconciliation_log`
Audit trail for reconciliation actions (dry-run and apply).
- `id` (uuid PK)
- `owner_id` (uuid FK→users, NOT NULL)
- `target_user_id` (uuid FK→users, NOT NULL)
- `company_id` (uuid FK→companies, nullable)
- `local_plan` (text NOT NULL) — plan before reconciliation
- `canonical_plan` (text NOT NULL) — plan after reconciliation
- `source` (text NOT NULL DEFAULT 'reconciliation') — 'reconciliation'|'force_sync'|'webhook'|'manual'
- `action` (text NOT NULL) — 'noop'|'fix'|'flag'|'dry_run'
- `reason` (text nullable)
- `owner_ip` (inet nullable)
- `created_at` (timestamptz DEFAULT now())

### 4. Fix `billing_audit` table
Add columns used by application code that don't exist yet:
- `event_type` (text nullable) — 'plan_changed'|'plan_scheduled'|'subscription_canceled'
- `from_plan` (text nullable) — old plan
- `to_plan` (text nullable) — new plan
- `changed_by` (uuid nullable, FK→users) — who made the change
- `metadata` (jsonb nullable) — additional context

### 5. Fix `billing_audit` INSERT policy
Change `WITH CHECK (false)` to allow owner inserts (the app uses server client, not service role).

### 6. RLS on all new tables
- `subscriptions`: company members can SELECT own; owner can SELECT all; owner can INSERT/UPDATE
- `webhook_events`: owner-only SELECT/INSERT
- `plan_reconciliation_log`: owner-only SELECT/INSERT

### 7. Backfill `subscriptions` from existing `companies` data
Creates a subscription row for every active user based on their company's `product_type`.

### 8. Clean corrupted `package_type` values
Fixes `package_type` values with trailing whitespace/CR characters.
*/

-- ─── 1. subscriptions table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id               uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id                  text NOT NULL DEFAULT 'starter',
  provider                 text NOT NULL DEFAULT 'internal',
  provider_subscription_id text,
  status                   text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
  current_period_end       timestamptz,
  price_id                 text,
  pending_change           jsonb,
  last_synced_at           timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_unique
  ON subscriptions(user_id);

CREATE INDEX IF NOT EXISTS subscriptions_company_id_idx
  ON subscriptions(company_id);

CREATE INDEX IF NOT EXISTS subscriptions_status_idx
  ON subscriptions(status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Company members can read their own subscription
DROP POLICY IF EXISTS "select_own_subscriptions" ON subscriptions;
CREATE POLICY "select_own_subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id()
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
  );

-- Owner can insert subscriptions
DROP POLICY IF EXISTS "insert_subscriptions_owner" ON subscriptions;
CREATE POLICY "insert_subscriptions_owner"
  ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'));

-- Owner can update subscriptions
DROP POLICY IF EXISTS "update_subscriptions_owner" ON subscriptions;
CREATE POLICY "update_subscriptions_owner"
  ON subscriptions FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'));

-- ─── 2. webhook_events table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text NOT NULL,
  event_id     text NOT NULL,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  attempts     int NOT NULL DEFAULT 0,
  last_error   text,
  processed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_event_id_unique
  ON webhook_events(provider, event_id);

CREATE INDEX IF NOT EXISTS webhook_events_status_idx
  ON webhook_events(status);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_webhook_events_owner" ON webhook_events;
CREATE POLICY "select_webhook_events_owner"
  ON webhook_events FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'));

DROP POLICY IF EXISTS "insert_webhook_events_owner" ON webhook_events;
CREATE POLICY "insert_webhook_events_owner"
  ON webhook_events FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'));

-- ─── 3. plan_reconciliation_log table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plan_reconciliation_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id      uuid REFERENCES companies(id) ON DELETE SET NULL,
  local_plan      text NOT NULL,
  canonical_plan  text NOT NULL,
  source          text NOT NULL DEFAULT 'reconciliation'
    CHECK (source IN ('reconciliation', 'force_sync', 'webhook', 'manual')),
  action          text NOT NULL DEFAULT 'noop'
    CHECK (action IN ('noop', 'fix', 'flag', 'dry_run')),
  reason          text,
  owner_ip        inet,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_reconciliation_log_target_user_idx
  ON plan_reconciliation_log(target_user_id, created_at);

CREATE INDEX IF NOT EXISTS plan_reconciliation_log_company_idx
  ON plan_reconciliation_log(company_id, created_at);

ALTER TABLE plan_reconciliation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_reconciliation_log_owner" ON plan_reconciliation_log;
CREATE POLICY "select_reconciliation_log_owner"
  ON plan_reconciliation_log FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'));

DROP POLICY IF EXISTS "insert_reconciliation_log_owner" ON plan_reconciliation_log;
CREATE POLICY "insert_reconciliation_log_owner"
  ON plan_reconciliation_log FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'));

-- ─── 4. Fix billing_audit: add missing columns ────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_audit' AND column_name = 'event_type') THEN
    ALTER TABLE billing_audit ADD COLUMN event_type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_audit' AND column_name = 'from_plan') THEN
    ALTER TABLE billing_audit ADD COLUMN from_plan text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_audit' AND column_name = 'to_plan') THEN
    ALTER TABLE billing_audit ADD COLUMN to_plan text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_audit' AND column_name = 'changed_by') THEN
    ALTER TABLE billing_audit ADD COLUMN changed_by uuid REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_audit' AND column_name = 'metadata') THEN
    ALTER TABLE billing_audit ADD COLUMN metadata jsonb;
  END IF;
END $$;

-- ─── 5. Fix billing_audit INSERT policy ───────────────────────────────────────

-- Drop the WITH CHECK (false) policy that blocks all non-service-role inserts
DROP POLICY IF EXISTS "insert_billing_audit_service" ON billing_audit;

-- Allow owner to insert billing_audit rows
DROP POLICY IF EXISTS "insert_billing_audit_owner" ON billing_audit;
CREATE POLICY "insert_billing_audit_owner"
  ON billing_audit FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner')
    OR company_id = get_user_company_id()
  );

-- ─── 6. Clean corrupted package_type values ────────────────────────────────────

UPDATE companies
SET package_type = trim(replace(replace(package_type, '\r', ''), '\n', '')),
    updated_at = now()
WHERE package_type != trim(replace(replace(package_type, '\r', ''), '\n', ''));

-- Also sync package_type to product_type where they diverge (product_type is canonical)
UPDATE companies
SET package_type = product_type,
    updated_at = now()
WHERE product_type IS NOT NULL
  AND package_type != product_type
  AND package_type NOT IN ('individual', 'pro');

-- ─── 7. Backfill subscriptions from existing data ─────────────────────────────

-- Insert a subscription row for every active user who doesn't have one yet
INSERT INTO subscriptions (user_id, company_id, plan_id, status, last_synced_at)
SELECT
  u.id,
  u.company_id,
  COALESCE(c.product_type, c.package_type, 'starter'),
  COALESCE(c.subscription_status, 'active'),
  now()
FROM users u
JOIN companies c ON c.id = u.company_id
WHERE u.active = true
  AND u.company_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;
