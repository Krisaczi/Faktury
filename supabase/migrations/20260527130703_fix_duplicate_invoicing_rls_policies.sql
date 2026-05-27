/*
  # Fix duplicate RLS policies on issued_invoices and issued_invoice_items

  Two migrations created overlapping policies on these tables.
  This migration drops the older "Owners and admins" policies, keeping only
  the current "Admins and accountants" set which correctly includes the
  accountant and viewer roles added in the invoicing RBAC migration.

  No data is modified. Only policy definitions change.
*/

-- ─── issued_invoices — drop old policies ──────────────────────────────────────

DROP POLICY IF EXISTS "Owners and admins can insert issued invoices" ON public.issued_invoices;
DROP POLICY IF EXISTS "Owners and admins can update issued invoices" ON public.issued_invoices;

-- ─── issued_invoice_items — drop old policies ─────────────────────────────────

DROP POLICY IF EXISTS "Owners and admins can insert invoice items" ON public.issued_invoice_items;
DROP POLICY IF EXISTS "Owners and admins can update invoice items" ON public.issued_invoice_items;
DROP POLICY IF EXISTS "Owners and admins can delete invoice items" ON public.issued_invoice_items;
