-- Add address fields (required for full company data)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS zip    text,
  ADD COLUMN IF NOT EXISTS city   text;

-- Add product selection and trial tracking
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS product_type     text CHECK (product_type IN ('starter', 'professional')),
  ADD COLUMN IF NOT EXISTS trial_active     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_expires_at timestamptz;

-- Back-fill product_type from existing package_type where present
UPDATE public.companies
   SET product_type = CASE
     WHEN package_type IN ('starter', 'professional') THEN package_type
     ELSE 'starter'
   END
 WHERE product_type IS NULL;

-- Set default for new rows
ALTER TABLE public.companies
  ALTER COLUMN product_type SET DEFAULT 'starter';

-- Relax nip to nullable so partial-data companies aren't blocked
-- (NIP is now required at onboarding, but existing rows may lack it)
ALTER TABLE public.companies
  ALTER COLUMN nip DROP NOT NULL;
