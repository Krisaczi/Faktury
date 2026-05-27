/*
  # Add invoicing roles (accountant, viewer) and RLS policies

  ## Summary
  Extends the users.role column to support two new roles needed for the
  invoicing module, and adds fine-grained RLS policies on issued_invoices
  and issued_invoice_items tables.

  ## New Role Values
  - `accountant` — can create, edit, issue, send to KSeF, and view invoices;
                   cannot access other admin areas (risk reports, vendor management).
  - `viewer`     — read-only access to issued invoices and their items; no writes.

  ## Changes

  ### 1. users table
  - Drops the existing CHECK constraint on the `role` column.
  - Adds a wider CHECK constraint that includes 'accountant' and 'viewer'.

  ### 2. issued_invoices — RLS policies
  - SELECT: owner, admin, accountant, viewer all may read rows belonging to
    their company.
  - INSERT: owner, admin, accountant only (viewers cannot create).
  - UPDATE: owner, admin, accountant only.
  - DELETE: owner and admin only (accountants cannot delete).

  ### 3. issued_invoice_items — RLS policies
  - SELECT: all roles may read items for invoices in their company.
  - INSERT/UPDATE/DELETE: owner, admin, accountant only.

  ## Security Notes
  - Every policy still enforces company isolation via company_id.
  - RLS was already enabled on both tables (from earlier migration).
  - Viewer role has zero write access anywhere in the invoicing schema.
*/

-- ─── 1. Widen users.role constraint ──────────────────────────────────────────

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'admin', 'member', 'accountant', 'viewer'));

-- ─── 2. issued_invoices RLS policies ─────────────────────────────────────────

-- Drop any pre-existing policies before recreating them
DROP POLICY IF EXISTS "Company members can view issued invoices"   ON public.issued_invoices;
DROP POLICY IF EXISTS "Admins and accountants can insert invoices"  ON public.issued_invoices;
DROP POLICY IF EXISTS "Admins and accountants can update invoices"  ON public.issued_invoices;
DROP POLICY IF EXISTS "Admins can delete invoices"                  ON public.issued_invoices;

-- SELECT — owner, admin, accountant, viewer
CREATE POLICY "Company members can view issued invoices"
  ON public.issued_invoices
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin', 'accountant', 'viewer')
    )
  );

-- INSERT — owner, admin, accountant
CREATE POLICY "Admins and accountants can insert invoices"
  ON public.issued_invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin', 'accountant')
    )
  );

-- UPDATE — owner, admin, accountant
CREATE POLICY "Admins and accountants can update invoices"
  ON public.issued_invoices
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin', 'accountant')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin', 'accountant')
    )
  );

-- DELETE — owner, admin only
CREATE POLICY "Admins can delete invoices"
  ON public.issued_invoices
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- ─── 3. issued_invoice_items RLS policies ────────────────────────────────────

DROP POLICY IF EXISTS "Company members can view invoice items"          ON public.issued_invoice_items;
DROP POLICY IF EXISTS "Admins and accountants can insert invoice items"  ON public.issued_invoice_items;
DROP POLICY IF EXISTS "Admins and accountants can update invoice items"  ON public.issued_invoice_items;
DROP POLICY IF EXISTS "Admins and accountants can delete invoice items"  ON public.issued_invoice_items;

-- SELECT — all roles (join through invoice)
CREATE POLICY "Company members can view invoice items"
  ON public.issued_invoice_items
  FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM public.issued_invoices
      WHERE company_id IN (
        SELECT company_id FROM public.users
        WHERE id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant', 'viewer')
      )
    )
  );

-- INSERT — owner, admin, accountant
CREATE POLICY "Admins and accountants can insert invoice items"
  ON public.issued_invoice_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM public.issued_invoices
      WHERE company_id IN (
        SELECT company_id FROM public.users
        WHERE id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant')
      )
    )
  );

-- UPDATE — owner, admin, accountant
CREATE POLICY "Admins and accountants can update invoice items"
  ON public.issued_invoice_items
  FOR UPDATE
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM public.issued_invoices
      WHERE company_id IN (
        SELECT company_id FROM public.users
        WHERE id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant')
      )
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM public.issued_invoices
      WHERE company_id IN (
        SELECT company_id FROM public.users
        WHERE id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant')
      )
    )
  );

-- DELETE — owner, admin, accountant (items are replaced atomically during edit)
CREATE POLICY "Admins and accountants can delete invoice items"
  ON public.issued_invoice_items
  FOR DELETE
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM public.issued_invoices
      WHERE company_id IN (
        SELECT company_id FROM public.users
        WHERE id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant')
      )
    )
  );
