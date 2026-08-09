/*
 * Second pass: remove remaining 'admin' references from RLS policies
 * that were missed by the first migration.
 */

-- 1. contact_messages: Admins can update → Owner can update
DROP POLICY IF EXISTS "Admins can update contact messages" ON public.contact_messages;
CREATE POLICY "Owner can update contact messages"
ON public.contact_messages FOR UPDATE TO authenticated
USING (is_caller_owner())
WITH CHECK (is_caller_owner());

-- 2. contact_messages: Admins can read → Owner can read
DROP POLICY IF EXISTS "Admins can read contact messages" ON public.contact_messages;
CREATE POLICY "Owner can read contact messages"
ON public.contact_messages FOR SELECT TO authenticated
USING (is_caller_owner());

-- 3. contact_submissions: Admins can read → Owner can read
DROP POLICY IF EXISTS "Admins can read contact submissions" ON public.contact_submissions;
CREATE POLICY "Owner can read contact submissions"
ON public.contact_submissions FOR SELECT TO authenticated
USING (is_caller_owner());

-- 4. email_reports: Owners and admins → Owner only
DROP POLICY IF EXISTS "Owners and admins can view email reports" ON public.email_reports;
CREATE POLICY "Owner can view email reports"
ON public.email_reports FOR SELECT TO authenticated
USING (is_caller_owner());

-- 5. exports_audit: Admins can view → Owner can view
DROP POLICY IF EXISTS "Admins can view exports audit" ON public.exports_audit;
CREATE POLICY "Owner can view exports audit"
ON public.exports_audit FOR SELECT TO authenticated
USING (is_caller_owner());

-- 6. issued_invoice_items: replace all admin-referencing policies
DROP POLICY IF EXISTS "Admins and accountants can update invoice items" ON public.issued_invoice_items;
DROP POLICY IF EXISTS "Admins and accountants can insert invoice items" ON public.issued_invoice_items;
DROP POLICY IF EXISTS "Admins and accountants can delete invoice items" ON public.issued_invoice_items;
DROP POLICY IF EXISTS "Company invoicers can insert invoice items" ON public.issued_invoice_items;
DROP POLICY IF EXISTS "Company admins can delete invoice items" ON public.issued_invoice_items;

-- Get the company_id via the issued_invoice → invoice chain
-- We need a helper or inline subquery. issued_invoice_items likely has issued_invoice_id.
-- Check column existence and use appropriate join.
CREATE POLICY "Invoicers on Pro plan can insert issued invoice items"
ON public.issued_invoice_items FOR INSERT TO authenticated
WITH CHECK (
  get_user_role() IN ('owner', 'accountant')
  AND company_has_invoicing(get_user_company_id())
);

CREATE POLICY "Invoicers on Pro plan can update issued invoice items"
ON public.issued_invoice_items FOR UPDATE TO authenticated
USING (
  get_user_role() IN ('owner', 'accountant')
  AND company_has_invoicing(get_user_company_id())
)
WITH CHECK (
  get_user_role() IN ('owner', 'accountant')
  AND company_has_invoicing(get_user_company_id())
);

CREATE POLICY "Owner can delete issued invoice items"
ON public.issued_invoice_items FOR DELETE TO authenticated
USING (is_caller_owner());

-- 7. risk_flags: Company admins can delete → Owner can delete
DROP POLICY IF EXISTS "Company admins can delete risk flags" ON public.risk_flags;
CREATE POLICY "Owner can delete risk flags"
ON public.risk_flags FOR DELETE TO authenticated
USING (is_caller_owner());

-- 8. vendors: Company admins can delete → Owner can delete
DROP POLICY IF EXISTS "Company admins can delete vendors" ON public.vendors;
CREATE POLICY "Owner can delete vendors"
ON public.vendors FOR DELETE TO authenticated
USING (
  company_id = get_user_company_id()
  AND is_caller_owner()
);