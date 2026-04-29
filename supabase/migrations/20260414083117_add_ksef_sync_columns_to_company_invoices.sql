/*
  # Add KSeF sync columns to company_invoices and company_vendors

  ## Summary
  Prepares the schema for the syncInvoices server action. Adds columns needed
  to store data parsed from the FA(3) XML and to efficiently deduplicate
  invoices and vendors across syncs.

  ## Changes to company_invoices
  - `seller_nip` (text) — NIP of the invoice issuer extracted from FA XML
  - `buyer_nip`  (text) — NIP of the invoice recipient extracted from FA XML
  - `ksef_reference` gets a UNIQUE constraint so ON CONFLICT upserts work
  - `seller_name` (text) — full name of the seller (mirrors company_vendors.name)

  ## Changes to company_vendors
  - `nip` already exists — add UNIQUE(company_id, nip) so vendor upserts
    can use ON CONFLICT(company_id, nip)

  ## New index
  - `company_invoices_ksef_reference_idx` for fast lookup by KSeF reference number

  ## Notes
  - All ALTER TABLE statements are wrapped in DO $$ IF NOT EXISTS $$ blocks to be
    idempotent (safe to run more than once).
  - The UNIQUE constraints use DO blocks to avoid errors if they already exist.
*/

-- Add seller_nip to company_invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_invoices' AND column_name = 'seller_nip'
  ) THEN
    ALTER TABLE company_invoices ADD COLUMN seller_nip text DEFAULT '';
  END IF;
END $$;

-- Add buyer_nip to company_invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_invoices' AND column_name = 'buyer_nip'
  ) THEN
    ALTER TABLE company_invoices ADD COLUMN buyer_nip text DEFAULT '';
  END IF;
END $$;

-- Add seller_name to company_invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_invoices' AND column_name = 'seller_name'
  ) THEN
    ALTER TABLE company_invoices ADD COLUMN seller_name text DEFAULT '';
  END IF;
END $$;

-- UNIQUE index on ksef_reference so ON CONFLICT (ksef_reference) upserts work
CREATE UNIQUE INDEX IF NOT EXISTS company_invoices_ksef_reference_unique_idx
  ON company_invoices (ksef_reference)
  WHERE ksef_reference IS NOT NULL AND ksef_reference <> '';

-- Fast lookup index on ksef_reference
CREATE INDEX IF NOT EXISTS company_invoices_ksef_reference_idx
  ON company_invoices (ksef_reference);

-- UNIQUE index on (company_id, nip) for company_vendors so vendor upserts work
CREATE UNIQUE INDEX IF NOT EXISTS company_vendors_company_id_nip_unique_idx
  ON company_vendors (company_id, nip)
  WHERE nip IS NOT NULL AND nip <> '';
