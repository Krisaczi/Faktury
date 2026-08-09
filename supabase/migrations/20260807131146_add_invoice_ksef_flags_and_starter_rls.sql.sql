/*
  # Package-based invoicing access control

  ## Problem
  Users on the Starter package can perform invoice mutation actions
  (create, edit, delete, add items/charges, review, flags) because
  the backend only checks role, not package. The `invoices` table
  has no way to distinguish KSeF-imported invoices (read-only) from
  manually created ones.

  ## Changes

  ### 1. Add `is_ksef` and `read_only` columns to `invoices`
  - `is_ksef boolean DEFAULT false` — true when the invoice was imported from KSeF
  - `read_only boolean DEFAULT false` — true when the invoice cannot be modified

  ### 2. Backfill existing KSeF invoices
  Any invoice with a non-null `ksef_reference_number` or whose
  `upload_session_id` points to a session with `source = 'ksef'`
  gets `is_ksef = true, read_only = true`.

  ### 3. RLS: block Starter companies from invoice mutations
  Add INSERT/UPDATE/DELETE policies that deny writes when the
  company's `product_type = 'starter'`. SELECT remains allowed
  (Starter users can preview KSeF invoices).
*/
-- ── 1. Add columns ───────────────────────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS is_ksef   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_only boolean NOT NULL DEFAULT false;

-- ── 2. Backfill KSeF invoices ────────────────────────────────────────────────
UPDATE public.invoices
SET is_ksef = true, read_only = true
WHERE ksef_reference_number IS NOT NULL;

UPDATE public.invoices
SET is_ksef = true, read_only = true
WHERE upload_session_id IS NOT NULL
  AND upload_session_id IN (
    SELECT id FROM public.upload_sessions WHERE source = 'ksef'
  );

-- ── 3. RLS: block Starter companies from invoice mutations ───────────────────
-- Drop existing mutation policies so we can replace with package-aware versions
DROP POLICY IF EXISTS "insert_invoices_starter_block" ON public.invoices;
DROP POLICY IF EXISTS "update_invoices_starter_block" ON public.invoices;
DROP POLICY IF EXISTS "delete_invoices_starter_block" ON public.invoices;

-- INSERT: deny when company is on Starter
CREATE POLICY "insert_invoices_starter_block"
  ON public.invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IS NOT NULL
    AND company_id = get_user_company_id()
    AND NOT EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = invoices.company_id
        AND COALESCE(c.product_type, c.package_type, 'starter') = 'starter'
    )
  );

-- UPDATE: deny when company is on Starter
CREATE POLICY "update_invoices_starter_block"
  ON public.invoices
  FOR UPDATE
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = get_user_company_id()
    AND NOT EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = invoices.company_id
        AND COALESCE(c.product_type, c.package_type, 'starter') = 'starter'
    )
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND company_id = get_user_company_id()
    AND NOT EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = invoices.company_id
        AND COALESCE(c.product_type, c.package_type, 'starter') = 'starter'
    )
  );

-- DELETE: deny when company is on Starter
CREATE POLICY "delete_invoices_starter_block"
  ON public.invoices
  FOR DELETE
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = get_user_company_id()
    AND NOT EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = invoices.company_id
        AND COALESCE(c.product_type, c.package_type, 'starter') = 'starter'
    )
  );
