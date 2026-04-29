/*
  # Add trial fields to companies table

  ## Changes
  - `trial_start` (timestamptz) — when the company's trial period began
  - `trial_end` (timestamptz) — when the company's trial period expires
  - `is_trial_active` (boolean, default true) — whether the trial is currently active
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'trial_start'
  ) THEN
    ALTER TABLE companies ADD COLUMN trial_start timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'trial_end'
  ) THEN
    ALTER TABLE companies ADD COLUMN trial_end timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'is_trial_active'
  ) THEN
    ALTER TABLE companies ADD COLUMN is_trial_active boolean DEFAULT true;
  END IF;
END $$;
