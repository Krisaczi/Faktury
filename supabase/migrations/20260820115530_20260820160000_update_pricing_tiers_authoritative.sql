/*
# Update pricing_tiers to authoritative plan rules

## Purpose
Updates the pricing_tiers table with canonical columns and sets authoritative
plan values for Starter and Professional tiers.

## Changes

### 1. Add columns to pricing_tiers
- `plan_id` (text, unique) — canonical plan identifier ('starter', 'professional')
- `display_name` (text) — human-readable name
- `max_users` (int, not null) — max users on this plan
- `storage_gb` (int, nullable) — storage limit in GB
- `invoices_per_month` (int, nullable) — monthly invoice limit (null = unlimited)
- `max_vendors_contractors` (int, nullable) — vendor/contractor limit (null = unlimited)
- `invoice_mode` (text, not null, default 'full') — 'preview' or 'full'
  CHECK constraint: invoice_mode IN ('preview', 'full')

### 2. Backfill new columns from existing data
Populates plan_id from `key`, display_name from `name`, and extracts
limits from the `limits` and `features` JSONB columns.

### 3. Set authoritative values
- Starter: max_users=1, invoices_per_month=10, max_vendors_contractors=25, invoice_mode='full'
- Professional: max_users=3, invoices_per_month=null, max_vendors_contractors=null, invoice_mode='full'

### 4. Update features JSONB
- Starter: invoicing=true (was false), users_limit=1 (was 2), invoices_per_month=10 (was 50)
- Professional: users_limit=3 (was 10), invoices_per_month=null (was 500)

### 5. RLS
No new tables — pricing_tiers already has RLS. Add SELECT policy for authenticated
users so they can read plan limits.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_tiers' AND column_name = 'plan_id') THEN
    ALTER TABLE pricing_tiers ADD COLUMN plan_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_tiers' AND column_name = 'display_name') THEN
    ALTER TABLE pricing_tiers ADD COLUMN display_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_tiers' AND column_name = 'max_users') THEN
    ALTER TABLE pricing_tiers ADD COLUMN max_users int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_tiers' AND column_name = 'storage_gb') THEN
    ALTER TABLE pricing_tiers ADD COLUMN storage_gb int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_tiers' AND column_name = 'invoices_per_month') THEN
    ALTER TABLE pricing_tiers ADD COLUMN invoices_per_month int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_tiers' AND column_name = 'max_vendors_contractors') THEN
    ALTER TABLE pricing_tiers ADD COLUMN max_vendors_contractors int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_tiers' AND column_name = 'invoice_mode') THEN
    ALTER TABLE pricing_tiers ADD COLUMN invoice_mode text NOT NULL DEFAULT 'full';
  END IF;
END $$;

-- Add unique constraint on plan_id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pricing_tiers_plan_id_key') THEN
    ALTER TABLE pricing_tiers ADD CONSTRAINT pricing_tiers_plan_id_key UNIQUE (plan_id);
  END IF;
END $$;

-- Add CHECK constraint on invoice_mode
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pricing_tiers_invoice_mode_check') THEN
    ALTER TABLE pricing_tiers ADD CONSTRAINT pricing_tiers_invoice_mode_check
    CHECK (invoice_mode IN ('preview', 'full'));
  END IF;
END $$;

-- Backfill plan_id from key
UPDATE pricing_tiers SET plan_id = key WHERE plan_id IS NULL;

-- Backfill display_name from name
UPDATE pricing_tiers SET display_name = name WHERE display_name IS NULL;

-- Backfill max_users from limits JSONB
UPDATE pricing_tiers SET max_users = (limits->>'users')::int WHERE max_users IS NULL AND limits ? 'users';
UPDATE pricing_tiers SET max_users = 1 WHERE max_users IS NULL;

-- Backfill storage_gb from limits JSONB
UPDATE pricing_tiers SET storage_gb = (limits->>'storage_gb')::int WHERE storage_gb IS NULL AND limits ? 'storage_gb';

-- Backfill invoices_per_month from features JSONB
UPDATE pricing_tiers SET invoices_per_month = NULL WHERE invoices_per_month IS NULL AND key = 'professional';
UPDATE pricing_tiers SET invoices_per_month = (features->>'invoices_per_month')::int WHERE invoices_per_month IS NULL AND features ? 'invoices_per_month';

-- Backfill max_vendors_contractors from features JSONB
UPDATE pricing_tiers SET max_vendors_contractors = (features->>'vendors_limit')::int WHERE max_vendors_contractors IS NULL AND features ? 'vendors_limit';

-- ─── Set authoritative values for Starter ─────────────────────────────────────
UPDATE pricing_tiers
SET
  max_users                 = 1,
  invoices_per_month        = 10,
  max_vendors_contractors   = 25,
  invoice_mode              = 'full',
  features                  = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(features, '{invoicing}', 'true'),
        '{users_limit}', '1'
      ),
      '{invoices_per_month}', '10'
    ),
    '{vendors_limit}', '25'
  ),
  limits                    = '{"users": 1, "invoices_per_month": 10}'::jsonb,
  updated_at                = now()
WHERE key = 'starter';

-- ─── Set authoritative values for Professional ────────────────────────────────
UPDATE pricing_tiers
SET
  max_users                 = 3,
  invoices_per_month        = NULL,
  max_vendors_contractors   = NULL,
  invoice_mode              = 'full',
  features                  = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(features, '{invoicing}', 'true'),
        '{users_limit}', '3'
      ),
      '{invoices_per_month}', 'null'
    ),
    '{vendors_limit}', 'null'
  ),
  limits                    = '{"users": 3, "invoices_per_month": null}'::jsonb,
  updated_at                = now()
WHERE key = 'professional';

-- Make max_users NOT NULL after backfill
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_tiers' AND column_name = 'max_users' AND is_nullable = 'YES') THEN
    ALTER TABLE pricing_tiers ALTER COLUMN max_users SET NOT NULL;
  END IF;
END $$;

-- Allow authenticated users to read pricing_tiers (for plan limits display)
DROP POLICY IF EXISTS "select_pricing_tiers_authenticated" ON pricing_tiers;
CREATE POLICY "select_pricing_tiers_authenticated"
  ON pricing_tiers FOR SELECT
  TO authenticated
  USING (true);
