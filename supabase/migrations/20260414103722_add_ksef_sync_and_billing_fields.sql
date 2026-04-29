/*
  # Add KSeF last sync timestamp and Lemon Squeezy billing fields

  ## Changes
  - `companies` table
    - Add `ksef_last_synced_at` (timestamptz, nullable): records when the last successful KSeF sync ran
    - Add `ls_customer_id` (text, nullable): Lemon Squeezy customer ID
    - Add `ls_subscription_id` (text, nullable): Lemon Squeezy subscription ID
    - Add `ls_variant_id` (text, nullable): current plan variant ID
    - Add `subscription_ends_at` (timestamptz, nullable): when the current subscription period ends

  ## Notes
  - All new columns are nullable with no default, to avoid breaking existing rows
  - No RLS changes needed; companies table already has RLS enabled with existing policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'ksef_last_synced_at'
  ) THEN
    ALTER TABLE companies ADD COLUMN ksef_last_synced_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'ls_customer_id'
  ) THEN
    ALTER TABLE companies ADD COLUMN ls_customer_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'ls_subscription_id'
  ) THEN
    ALTER TABLE companies ADD COLUMN ls_subscription_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'ls_variant_id'
  ) THEN
    ALTER TABLE companies ADD COLUMN ls_variant_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'subscription_ends_at'
  ) THEN
    ALTER TABLE companies ADD COLUMN subscription_ends_at timestamptz;
  END IF;
END $$;
