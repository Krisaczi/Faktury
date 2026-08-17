/*
# Make postal_code (ZIP) mandatory on buyer_companies

## Purpose
ZIP code is now a required field for all customers. The `postal_code` column
already exists on `buyer_companies` but is nullable. This migration:
1. Backfills any NULL postal_code with a placeholder '00-000' so existing
   rows satisfy the NOT NULL constraint.
2. Alters postal_code to NOT NULL.

## Rollback
To undo, run:
  ALTER TABLE buyer_companies ALTER COLUMN postal_code DROP NOT NULL;
*/

-- ─── 1. Backfill NULL postal_code ──────────────────────────────────────────────
UPDATE buyer_companies
SET postal_code = '00-000', updated_at = now()
WHERE postal_code IS NULL OR postal_code = '';

-- ─── 2. Enforce NOT NULL ──────────────────────────────────────────────────────
ALTER TABLE buyer_companies ALTER COLUMN postal_code SET NOT NULL;
