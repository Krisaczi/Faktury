/*
# Fix RLS owner bypass for issued_invoice_items INSERT, UPDATE, and SELECT policies

## Problem
Same issue as the issued_invoices fix: the RLS policies on issued_invoice_items
require company_has_invoicing() (product_type = 'professional'), but the
application code has an owner bypass. Owners on non-professional companies are
blocked by RLS when inserting invoice line items.

## Fix
Add owner bypass via is_caller_owner() to INSERT, UPDATE, and SELECT policies,
matching the application-level behavior.

## Security
- Uses existing is_caller_owner() SECURITY DEFINER function
- Non-owner users on non-professional companies still cannot access items
- DELETE policy already uses is_caller_owner() — no change needed
*/

-- INSERT: add owner bypass
DROP POLICY IF EXISTS "Invoicers on Pro plan can insert issued invoice items" ON issued_invoice_items;

CREATE POLICY "Invoicers on Pro plan can insert issued invoice items"
ON issued_invoice_items FOR INSERT
TO authenticated
WITH CHECK (
  (get_user_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))
  AND (
    is_caller_owner()
    OR company_has_invoicing(get_user_company_id())
  )
);

-- UPDATE: add owner bypass to both policies
DROP POLICY IF EXISTS "Company invoicers can update invoice items" ON issued_invoice_items;

CREATE POLICY "Company invoicers can update invoice items"
ON issued_invoice_items FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM issued_invoices ii
    WHERE ii.id = issued_invoice_items.invoice_id
    AND ii.company_id = get_user_company_id()
    AND (
      is_caller_owner()
      OR company_has_invoicing(ii.company_id)
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM issued_invoices ii
    WHERE ii.id = issued_invoice_items.invoice_id
    AND ii.company_id = get_user_company_id()
    AND (
      is_caller_owner()
      OR company_has_invoicing(ii.company_id)
    )
  )
);

DROP POLICY IF EXISTS "Invoicers on Pro plan can update issued invoice items" ON issued_invoice_items;

CREATE POLICY "Invoicers on Pro plan can update issued invoice items"
ON issued_invoice_items FOR UPDATE
TO authenticated
USING (
  (get_user_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))
  AND (
    is_caller_owner()
    OR company_has_invoicing(get_user_company_id())
  )
)
WITH CHECK (
  (get_user_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))
  AND (
    is_caller_owner()
    OR company_has_invoicing(get_user_company_id())
  )
);

-- SELECT: add owner bypass
DROP POLICY IF EXISTS "Company members can view invoice items" ON issued_invoice_items;

CREATE POLICY "Company members can view invoice items"
ON issued_invoice_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM issued_invoices ii
    WHERE ii.id = issued_invoice_items.invoice_id
    AND ii.company_id = get_user_company_id()
    AND (
      is_caller_owner()
      OR company_has_invoicing(ii.company_id)
    )
  )
);
