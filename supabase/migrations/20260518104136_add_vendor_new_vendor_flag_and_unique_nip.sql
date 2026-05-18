/*
  # Vendor auto-creation enhancements

  1. Changes to `vendors` table
     - Add `new_vendor` boolean column (DEFAULT false) to track auto-created vendors
     - Add UNIQUE constraint on (company_id, nip) to prevent duplicate NIP vendors per company
       Uses a partial index so NULL nip values are not constrained (multiple vendors can have no NIP)

  2. Notes
     - Existing vendors are not modified (new_vendor stays false by default)
     - The partial unique index only applies when nip IS NOT NULL
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendors' AND column_name = 'new_vendor'
  ) THEN
    ALTER TABLE vendors ADD COLUMN new_vendor boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Partial unique index: one vendor per (company_id, nip) when nip is not null
CREATE UNIQUE INDEX IF NOT EXISTS vendors_company_id_nip_unique
  ON vendors (company_id, nip)
  WHERE nip IS NOT NULL;
