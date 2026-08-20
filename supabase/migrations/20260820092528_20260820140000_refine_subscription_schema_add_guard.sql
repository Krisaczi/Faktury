/*
# Refine subscription schema and add provider guard

## Purpose
Adds columns required by the canonical local subscription model and creates
a guard mechanism that rejects any attempt to update plan state from external
billing provider sources.

## Changes

### 1. Add columns to `subscriptions`
- `effective_from` (timestamptz nullable) — when the current plan became effective
- `effective_until` (timestamptz nullable) — when the plan expires (null = ongoing)
- `price_meta` (jsonb nullable) — price metadata (amount, currency, interval)
Backfills `effective_from` for existing rows from `last_synced_at` or `created_at`.

### 2. Add `provider` column to `plan_change_audit`
- `provider` (text NOT NULL DEFAULT 'local') — source of the change ('local'|'owner'|'webhook'|'external')
- CHECK constraint restricting to allowed values

### 3. Create `provider_update_guard` table
Tracks any attempt to modify plan state from an external provider source.
The application checks this table before applying plan changes — if a guard
row exists with `blocked = true`, the update is rejected.
- `id` (uuid PK)
- `source` (text NOT NULL) — 'stripe'|'lemonsqueezy'|'paddle'|'external'
- `event_type` (text NOT NULL)
- `payload` (jsonb NOT NULL)
- `blocked` (boolean NOT NULL DEFAULT true)
- `reason` (text)
- `created_at` (timestamptz DEFAULT now())

### 4. Backfill effective_from
Sets `effective_from` for existing subscription rows.
*/
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'effective_from') THEN
    ALTER TABLE subscriptions ADD COLUMN effective_from timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'effective_until') THEN
    ALTER TABLE subscriptions ADD COLUMN effective_until timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'price_meta') THEN
    ALTER TABLE subscriptions ADD COLUMN price_meta jsonb;
  END IF;
END $$;

-- Backfill effective_from
UPDATE subscriptions
SET effective_from = COALESCE(last_synced_at, created_at)
WHERE effective_from IS NULL;

-- Add provider column to plan_change_audit
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plan_change_audit' AND column_name = 'provider') THEN
    ALTER TABLE plan_change_audit ADD COLUMN provider text NOT NULL DEFAULT 'local';
  END IF;
END $$;

-- Add CHECK constraint (drop first for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_change_audit_provider_check') THEN
    ALTER TABLE plan_change_audit
    ADD CONSTRAINT plan_change_audit_provider_check
    CHECK (provider IN ('local', 'owner', 'webhook', 'external'));
  END IF;
END $$;

-- Create provider_update_guard table
CREATE TABLE IF NOT EXISTS provider_update_guard (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text NOT NULL,
  event_type  text NOT NULL,
  payload     jsonb NOT NULL,
  blocked     boolean NOT NULL DEFAULT true,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_update_guard_created_at_idx
  ON provider_update_guard(created_at DESC);

ALTER TABLE provider_update_guard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_provider_guard_owner" ON provider_update_guard;
CREATE POLICY "select_provider_guard_owner"
  ON provider_update_guard FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'));

DROP POLICY IF EXISTS "insert_provider_guard_owner" ON provider_update_guard;
CREATE POLICY "insert_provider_guard_owner"
  ON provider_update_guard FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'));
