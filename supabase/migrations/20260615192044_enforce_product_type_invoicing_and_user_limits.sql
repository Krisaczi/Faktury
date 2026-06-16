-- ─── Helper function: check if a company has invoicing enabled ────────────────
-- Returns true only if product_type = 'professional'.
-- Used by RLS policies on issued_invoices and issued_invoice_items.

CREATE OR REPLACE FUNCTION public.company_has_invoicing(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT product_type = 'professional'
       FROM companies
      WHERE id = p_company_id),
    false
  );
$$;

-- ─── Helper function: check active user count against product limit ────────────
-- Returns true if adding one more user would stay within plan limits.
-- starter: max 1 active user; professional: max 3; others: unlimited.

CREATE OR REPLACE FUNCTION public.company_user_slot_available(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN c.product_type = 'starter'      THEN (SELECT COUNT(*) FROM users WHERE company_id = p_company_id AND active = true) < 1
    WHEN c.product_type = 'professional' THEN (SELECT COUNT(*) FROM users WHERE company_id = p_company_id AND active = true) < 3
    ELSE true
  END
  FROM companies c
  WHERE c.id = p_company_id;
$$;

-- ─── Drop and recreate issued_invoices RLS policies with product_type guard ───

-- Read: authenticated users whose company has invoicing enabled
DROP POLICY IF EXISTS "Company members can view issued invoices" ON issued_invoices;
CREATE POLICY "Company members can view issued invoices"
  ON issued_invoices
  FOR SELECT
  TO authenticated
  USING (
    company_id = (
      SELECT company_id FROM users WHERE id = auth.uid() LIMIT 1
    )
    AND public.company_has_invoicing(company_id)
  );

-- Insert: owner/admin/accountant with invoicing plan
DROP POLICY IF EXISTS "Company invoicers can insert issued invoices" ON issued_invoices;
CREATE POLICY "Company invoicers can insert issued invoices"
  ON issued_invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (
      SELECT company_id FROM users WHERE id = auth.uid() LIMIT 1
    )
    AND (
      SELECT role IN ('owner', 'admin', 'accountant')
        FROM users WHERE id = auth.uid() LIMIT 1
    )
    AND public.company_has_invoicing(company_id)
  );

-- Update: owner/admin/accountant with invoicing plan
DROP POLICY IF EXISTS "Company invoicers can update issued invoices" ON issued_invoices;
CREATE POLICY "Company invoicers can update issued invoices"
  ON issued_invoices
  FOR UPDATE
  TO authenticated
  USING (
    company_id = (
      SELECT company_id FROM users WHERE id = auth.uid() LIMIT 1
    )
    AND (
      SELECT role IN ('owner', 'admin', 'accountant')
        FROM users WHERE id = auth.uid() LIMIT 1
    )
    AND public.company_has_invoicing(company_id)
  )
  WITH CHECK (
    company_id = (
      SELECT company_id FROM users WHERE id = auth.uid() LIMIT 1
    )
    AND public.company_has_invoicing(company_id)
  );

-- Delete: owner/admin only with invoicing plan
DROP POLICY IF EXISTS "Company admins can delete issued invoices" ON issued_invoices;
CREATE POLICY "Company admins can delete issued invoices"
  ON issued_invoices
  FOR DELETE
  TO authenticated
  USING (
    company_id = (
      SELECT company_id FROM users WHERE id = auth.uid() LIMIT 1
    )
    AND (
      SELECT role IN ('owner', 'admin')
        FROM users WHERE id = auth.uid() LIMIT 1
    )
    AND public.company_has_invoicing(company_id)
  );

-- ─── issued_invoice_items: mirror issued_invoices policies ────────────────────

DROP POLICY IF EXISTS "Company members can view invoice items" ON issued_invoice_items;
CREATE POLICY "Company members can view invoice items"
  ON issued_invoice_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM issued_invoices ii
       WHERE ii.id = invoice_id
         AND ii.company_id = (SELECT company_id FROM users WHERE id = auth.uid() LIMIT 1)
         AND public.company_has_invoicing(ii.company_id)
    )
  );

DROP POLICY IF EXISTS "Company invoicers can insert invoice items" ON issued_invoice_items;
CREATE POLICY "Company invoicers can insert invoice items"
  ON issued_invoice_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM issued_invoices ii
       WHERE ii.id = invoice_id
         AND ii.company_id = (SELECT company_id FROM users WHERE id = auth.uid() LIMIT 1)
         AND public.company_has_invoicing(ii.company_id)
         AND (SELECT role IN ('owner','admin','accountant') FROM users WHERE id = auth.uid() LIMIT 1)
    )
  );

DROP POLICY IF EXISTS "Company invoicers can update invoice items" ON issued_invoice_items;
CREATE POLICY "Company invoicers can update invoice items"
  ON issued_invoice_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM issued_invoices ii
       WHERE ii.id = invoice_id
         AND ii.company_id = (SELECT company_id FROM users WHERE id = auth.uid() LIMIT 1)
         AND public.company_has_invoicing(ii.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM issued_invoices ii
       WHERE ii.id = invoice_id
         AND public.company_has_invoicing(ii.company_id)
    )
  );

DROP POLICY IF EXISTS "Company admins can delete invoice items" ON issued_invoice_items;
CREATE POLICY "Company admins can delete invoice items"
  ON issued_invoice_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM issued_invoices ii
       WHERE ii.id = invoice_id
         AND ii.company_id = (SELECT company_id FROM users WHERE id = auth.uid() LIMIT 1)
         AND public.company_has_invoicing(ii.company_id)
         AND (SELECT role IN ('owner','admin') FROM users WHERE id = auth.uid() LIMIT 1)
    )
  );
