/*
  # Add demo mode flag to companies

  ## Summary
  Adds an `is_demo` boolean column to the `companies` table to enable a sandboxed
  demo experience with pre-seeded vendors, invoices, and risk flags. When this flag
  is true, KSeF sync and billing flows are disabled for that company.

  ## Changes
  - `companies.is_demo` (boolean, default false) — marks a company as a demo sandbox
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'is_demo'
  ) THEN
    ALTER TABLE companies ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
  END IF;
END $$;
