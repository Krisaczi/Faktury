-- Add address and bank account columns to vendors.
-- new_vendor and the (company_id, nip) unique index already exist from a prior migration,
-- so we guard each statement with IF NOT EXISTS / DO blocks to be idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'address_street') THEN
    ALTER TABLE public.vendors ADD COLUMN address_street text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'address_zip') THEN
    ALTER TABLE public.vendors ADD COLUMN address_zip text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'address_city') THEN
    ALTER TABLE public.vendors ADD COLUMN address_city text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'bank_account_number') THEN
    ALTER TABLE public.vendors ADD COLUMN bank_account_number text;
  END IF;
END $$;

-- Ensure the partial unique index on (company_id, nip) exists (created in an earlier migration,
-- but re-declare idempotently in case this runs on a fresh schema).
CREATE UNIQUE INDEX IF NOT EXISTS vendors_company_id_nip_unique
  ON public.vendors (company_id, nip)
  WHERE nip IS NOT NULL;
