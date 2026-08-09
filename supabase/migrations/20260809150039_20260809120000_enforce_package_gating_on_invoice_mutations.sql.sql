/*
# Enforce package-based gating on all invoice mutation tables

## Summary

Starter-package users could previously bypass the invoicing lock because several
RLS policies on `issued_invoices`, `invoice_items`, `invoice_charges`, and
`invoice_number_sequences` only checked the user's *role* (admin/accountant)
without also checking the company's *package* (product_type). Because Postgres
RLS policies are OR'd together (permissive by default), a single loose policy
that omits the package check is enough to open the gate for every Starter
accountant.

This migration closes that gap by:

1. Dropping every loose role-only mutation policy on the four invoice tables.
2. Replacing them with a single, strict policy per verb that requires BOTH
   the correct role AND `company_has_invoicing(company_id)`.
3. Adding package gating to `invoice_number_sequences` (previously ungated).
4. Ensuring KSeF SELECT policies on `invoices`/`invoice_items`/`invoice_charges`
   still work for Starter (read-only preview), while mutation policies require Pro.
5. Backfilling `is_ksef = true, read_only = true` on any invoices that have a
   `ksef_reference_number` but are not yet flagged.
6. Adding `get_user_role()` and `get_user_package()` SECURITY DEFINER helpers so
   edge functions, API routes, and RLS policies can check role/package in one call.

## Tables affected

- `issued_invoices` — drop 3 loose policies (INSERT/UPDATE/DELETE)
- `invoice_items` — drop 3 loose policies, replace with 3 strict ones
- `invoice_charges` — drop 3 loose policies, replace with 3 strict ones
- `invoice_number_sequences` — add INSERT/UPDATE/DELETE policies with package gating

## New / changed functions

- `get_user_package()` — returns the caller's company product_type ('starter' | 'professional' | null)
- `get_user_role()` — returns the caller's role text from the users table

## Security changes

- All mutation policies now require `company_has_invoicing(company_id)` in
  addition to the existing role check. A Starter accountant can no longer
  INSERT/UPDATE/DELETE on any invoice-related table.
- Starter users retain SELECT on `invoices`, `invoice_items`, `invoice_charges`
  (read-only preview) but the `issued_invoices` SELECT policy already requires
  `company_has_invoicing`, so Starter users see nothing there.

## Rollback

To revert, re-create the dropped loose policies. The strict policies can be
dropped without data loss. No columns or tables are created or destroyed.
*/

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Helper functions
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_package()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT c.product_type
     FROM public.users u
     JOIN public.companies c ON c.id = u.company_id
     WHERE u.id = auth.uid()
     LIMIT 1),
    'starter'
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_user_package() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. issued_invoices — drop loose policies (keep strict ones already in place)
-- ════════════════════════════════════════════════════════════════════════════

-- These loose policies only check role, not package. Because RLS policies are
-- OR'd, they completely bypass the strict "Company invoicers..." policies.
DROP POLICY IF EXISTS "Admins and accountants can insert invoices" ON issued_invoices;
DROP POLICY IF EXISTS "Admins and accountants can update invoices" ON issued_invoices;
DROP POLICY IF EXISTS "Admins can delete invoices" ON issued_invoices;

-- The following strict policies already exist and are correct:
--   "Company invoicers can insert issued invoices"  (INSERT, checks company_has_invoicing)
--   "Company invoicers can update issued invoices"  (UPDATE, checks company_has_invoicing)
--   "Company admins can delete issued invoices"     (DELETE, checks company_has_invoicing)
--   "Company members can view issued invoices"      (SELECT, checks company_has_invoicing)

-- ════════════════════════════════════════════════════════════════════════════
-- 2. invoice_items — replace loose role-only policies with strict ones
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins and accountants can insert invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Admins and accountants can update invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Admins can delete invoice items" ON invoice_items;

DROP POLICY IF EXISTS "Invoicers on Pro plan can insert invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Invoicers on Pro plan can update invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Admins on Pro plan can delete invoice items" ON invoice_items;

CREATE POLICY "Invoicers on Pro plan can insert invoice items"
ON invoice_items FOR INSERT
TO authenticated
WITH CHECK (
  invoice_id IN (
    SELECT i.id FROM invoices i
    WHERE i.company_id = get_user_company_id()
  )
  AND get_user_role() IN ('owner', 'admin', 'accountant')
  AND company_has_invoicing(get_user_company_id())
);

CREATE POLICY "Invoicers on Pro plan can update invoice items"
ON invoice_items FOR UPDATE
TO authenticated
USING (
  invoice_id IN (
    SELECT i.id FROM invoices i
    WHERE i.company_id = get_user_company_id()
  )
  AND get_user_role() IN ('owner', 'admin', 'accountant')
  AND company_has_invoicing(get_user_company_id())
)
WITH CHECK (
  invoice_id IN (
    SELECT i.id FROM invoices i
    WHERE i.company_id = get_user_company_id()
  )
  AND get_user_role() IN ('owner', 'admin', 'accountant')
  AND company_has_invoicing(get_user_company_id())
);

CREATE POLICY "Admins on Pro plan can delete invoice items"
ON invoice_items FOR DELETE
TO authenticated
USING (
  invoice_id IN (
    SELECT i.id FROM invoices i
    WHERE i.company_id = get_user_company_id()
  )
  AND get_user_role() IN ('owner', 'admin')
  AND company_has_invoicing(get_user_company_id())
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. invoice_charges — same treatment as invoice_items
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins and accountants can insert invoice charges" ON invoice_charges;
DROP POLICY IF EXISTS "Admins and accountants can update invoice charges" ON invoice_charges;
DROP POLICY IF EXISTS "Admins can delete invoice charges" ON invoice_charges;

DROP POLICY IF EXISTS "Invoicers on Pro plan can insert invoice charges" ON invoice_charges;
DROP POLICY IF EXISTS "Invoicers on Pro plan can update invoice charges" ON invoice_charges;
DROP POLICY IF EXISTS "Admins on Pro plan can delete invoice charges" ON invoice_charges;

CREATE POLICY "Invoicers on Pro plan can insert invoice charges"
ON invoice_charges FOR INSERT
TO authenticated
WITH CHECK (
  invoice_id IN (
    SELECT i.id FROM invoices i
    WHERE i.company_id = get_user_company_id()
  )
  AND get_user_role() IN ('owner', 'admin', 'accountant')
  AND company_has_invoicing(get_user_company_id())
);

CREATE POLICY "Invoicers on Pro plan can update invoice charges"
ON invoice_charges FOR UPDATE
TO authenticated
USING (
  invoice_id IN (
    SELECT i.id FROM invoices i
    WHERE i.company_id = get_user_company_id()
  )
  AND get_user_role() IN ('owner', 'admin', 'accountant')
  AND company_has_invoicing(get_user_company_id())
)
WITH CHECK (
  invoice_id IN (
    SELECT i.id FROM invoices i
    WHERE i.company_id = get_user_company_id()
  )
  AND get_user_role() IN ('owner', 'admin', 'accountant')
  AND company_has_invoicing(get_user_company_id())
);

CREATE POLICY "Admins on Pro plan can delete invoice charges"
ON invoice_charges FOR DELETE
TO authenticated
USING (
  invoice_id IN (
    SELECT i.id FROM invoices i
    WHERE i.company_id = get_user_company_id()
  )
  AND get_user_role() IN ('owner', 'admin')
  AND company_has_invoicing(get_user_company_id())
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. invoice_number_sequences — add package-gated mutation policies
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Invoicers on Pro plan can insert sequences" ON invoice_number_sequences;
DROP POLICY IF EXISTS "Invoicers on Pro plan can update sequences" ON invoice_number_sequences;
DROP POLICY IF EXISTS "Admins on Pro plan can delete sequences" ON invoice_number_sequences;

CREATE POLICY "Invoicers on Pro plan can insert sequences"
ON invoice_number_sequences FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND get_user_role() IN ('owner', 'admin', 'accountant')
  AND company_has_invoicing(get_user_company_id())
);

CREATE POLICY "Invoicers on Pro plan can update sequences"
ON invoice_number_sequences FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND get_user_role() IN ('owner', 'admin', 'accountant')
  AND company_has_invoicing(get_user_company_id())
)
WITH CHECK (
  company_id = get_user_company_id()
  AND get_user_role() IN ('owner', 'admin', 'accountant')
  AND company_has_invoicing(get_user_company_id())
);

CREATE POLICY "Admins on Pro plan can delete sequences"
ON invoice_number_sequences FOR DELETE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND get_user_role() IN ('owner', 'admin')
  AND company_has_invoicing(get_user_company_id())
);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Backfill: mark KSeF-imported invoices as is_ksef + read_only
-- ════════════════════════════════════════════════════════════════════════════

UPDATE invoices
SET is_ksef = true,
    read_only = true
WHERE ksef_reference_number IS NOT NULL
  AND (is_ksef = false OR read_only = false);
