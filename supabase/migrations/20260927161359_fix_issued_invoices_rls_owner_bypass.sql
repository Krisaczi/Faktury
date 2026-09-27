/*
# Fix RLS owner bypass for issued_invoices INSERT and UPDATE policies

## Problem
The application code in `createInvoice` and `updateInvoice` has an owner bypass
that skips the `requireInvoicingEnabled()` check for platform owners. However,
the RLS policies on `issued_invoices` do NOT have this same bypass. The INSERT
and UPDATE policies require `company_has_invoicing(get_user_company_id())` which
returns true only when `product_type = 'professional'`.

This means owners of companies with `product_type = 'starter'` (or any non-
professional type) can pass the application-level check but are blocked by RLS
at the database level, producing: "new row violates row-level security policy
for table issued_invoices".

## Fix
Update the INSERT and UPDATE policies to OR-in an owner bypass: if the caller
is the platform owner (`is_caller_owner()`), the invoicing requirement is
waived — matching the application-level behavior.

## Security
- No new tables or columns.
- The owner bypass uses the existing `is_caller_owner()` SECURITY DEFINER
  function, which checks `users.role = 'owner'` for `auth.uid()`.
- Non-owner users on non-professional companies still cannot insert/update
  issued invoices — the `company_has_invoicing()` gate still applies to them.
- SELECT and DELETE policies are unchanged.
*/

-- Drop and recreate INSERT policy with owner bypass
DROP POLICY IF EXISTS "Company invoicers can insert issued invoices" ON issued_invoices;

CREATE POLICY "Company invoicers can insert issued invoices"
ON issued_invoices FOR INSERT
TO authenticated
WITH CHECK (
  (company_id = get_user_company_id())
  AND (get_user_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))
  AND (
    is_caller_owner()
    OR company_has_invoicing(get_user_company_id())
  )
);

-- Drop and recreate UPDATE policy with owner bypass
DROP POLICY IF EXISTS "Company invoicers can update issued invoices" ON issued_invoices;

CREATE POLICY "Company invoicers can update issued invoices"
ON issued_invoices FOR UPDATE
TO authenticated
USING (
  (company_id = get_user_company_id())
  AND (get_user_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))
  AND (
    is_caller_owner()
    OR company_has_invoicing(get_user_company_id())
  )
)
WITH CHECK (
  (company_id = get_user_company_id())
  AND (get_user_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))
  AND (
    is_caller_owner()
    OR company_has_invoicing(get_user_company_id())
  )
);
