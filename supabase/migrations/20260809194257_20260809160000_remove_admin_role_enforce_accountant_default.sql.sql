/*
 * Remove the "admin" role entirely and enforce "accountant" as the default.
 * Root cause: complete_user_onboarding() set role='admin' for every new user.
 */

-- 1. Fix complete_user_onboarding: assign 'accountant' (NOT 'admin')
CREATE OR REPLACE FUNCTION public.complete_user_onboarding(p_user_id uuid, p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_company_id uuid;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cannot onboard another user: caller % tried to onboard %', auth.uid(), p_user_id;
  END IF;

  SELECT company_id INTO v_current_company_id
  FROM public.users WHERE id = p_user_id;

  IF v_current_company_id IS NOT NULL THEN
    RAISE EXCEPTION 'User % is already onboarded to company %', p_user_id, v_current_company_id;
  END IF;

  UPDATE public.users
  SET company_id = p_company_id, role = 'accountant', updated_at = now()
  WHERE id = p_user_id AND company_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found or already onboarded', p_user_id;
  END IF;
END;
$function$;

-- 2. Demote existing admin rows → accountant
UPDATE public.users SET role = 'accountant', updated_at = now() WHERE role = 'admin';

-- 3. Replace role CHECK constraints
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_valid;
ALTER TABLE public.users ADD CONSTRAINT users_role_valid CHECK (role IN ('owner', 'accountant'));

-- 4. users table RLS: remove admin policies
DROP POLICY IF EXISTS "Admins can update company members" ON public.users;
DROP POLICY IF EXISTS "Admins can update non-privileged fields" ON public.users;

DROP POLICY IF EXISTS "Owner can update any company member" ON public.users;
CREATE POLICY "Owner can update any company member"
ON public.users FOR UPDATE TO authenticated
USING (company_id IS NOT NULL AND company_id = get_user_company_id() AND is_caller_owner())
WITH CHECK (company_id IS NOT NULL AND company_id = get_user_company_id() AND role = 'accountant');

DROP POLICY IF EXISTS "Users can update own non-privileged fields" ON public.users;
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
CREATE POLICY "Users can update own non-privileged fields"
ON public.users FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid() AND role = (SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1));

-- 5. audit_logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Owner can view audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (company_id = get_user_company_id() AND is_caller_owner());

-- 6. company_bank_accounts
DROP POLICY IF EXISTS "insert_company_bank_accounts" ON public.company_bank_accounts;
CREATE POLICY "insert_company_bank_accounts"
ON public.company_bank_accounts FOR INSERT TO authenticated
WITH CHECK (company_id = get_user_company_id() AND is_caller_owner());

DROP POLICY IF EXISTS "update_company_bank_accounts" ON public.company_bank_accounts;
CREATE POLICY "update_company_bank_accounts"
ON public.company_bank_accounts FOR UPDATE TO authenticated
USING (company_id = get_user_company_id() AND is_caller_owner())
WITH CHECK (company_id = get_user_company_id() AND is_caller_owner());

-- 7. company_package_audit
DROP POLICY IF EXISTS "Owner or admin can insert package audit" ON public.company_package_audit;
CREATE POLICY "Owner can insert package audit"
ON public.company_package_audit FOR INSERT TO authenticated
WITH CHECK (auth.uid() = changed_by AND EXISTS (
  SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.company_id = company_package_audit.company_id AND u.role = 'owner'
));

-- 8. contact_messages
DROP POLICY IF EXISTS "Admins can delete contact messages" ON public.contact_messages;
CREATE POLICY "Owner can delete contact messages"
ON public.contact_messages FOR DELETE TO authenticated
USING (is_caller_owner());

-- 9. invoices DELETE
DROP POLICY IF EXISTS "Company admins can delete invoices" ON public.invoices;
CREATE POLICY "Owner can delete invoices"
ON public.invoices FOR DELETE TO authenticated
USING (company_id = get_user_company_id() AND is_caller_owner());

-- 10. issued_invoices DELETE
DROP POLICY IF EXISTS "Company admins can delete issued invoices" ON public.issued_invoices;
CREATE POLICY "Owner can delete issued invoices"
ON public.issued_invoices FOR DELETE TO authenticated
USING (company_id = get_user_company_id() AND is_caller_owner());

-- 11. issued_invoices INSERT/UPDATE — drop any admin-referencing policies then recreate
DO $$
DECLARE p_record RECORD;
BEGIN
  FOR p_record IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'issued_invoices'
      AND cmd IN ('INSERT','UPDATE')
      AND (qual ILIKE '%admin%' OR with_check ILIKE '%admin%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.issued_invoices', p_record.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Company invoicers can insert issued invoices" ON public.issued_invoices;
CREATE POLICY "Company invoicers can insert issued invoices"
ON public.issued_invoices FOR INSERT TO authenticated
WITH CHECK (company_id = get_user_company_id() AND get_user_role() IN ('owner','accountant') AND company_has_invoicing(get_user_company_id()));

DROP POLICY IF EXISTS "Company invoicers can update issued invoices" ON public.issued_invoices;
CREATE POLICY "Company invoicers can update issued invoices"
ON public.issued_invoices FOR UPDATE TO authenticated
USING (company_id = get_user_company_id() AND get_user_role() IN ('owner','accountant') AND company_has_invoicing(get_user_company_id()))
WITH CHECK (company_id = get_user_company_id() AND get_user_role() IN ('owner','accountant') AND company_has_invoicing(get_user_company_id()));

-- 12. invoice_items INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Admins on Pro plan can delete invoice items" ON public.invoice_items;
CREATE POLICY "Owner can delete invoice items"
ON public.invoice_items FOR DELETE TO authenticated
USING (invoice_id IN (SELECT i.id FROM public.invoices i WHERE i.company_id = get_user_company_id()) AND is_caller_owner());

DROP POLICY IF EXISTS "Invoicers on Pro plan can insert invoice items" ON public.invoice_items;
CREATE POLICY "Invoicers on Pro plan can insert invoice items"
ON public.invoice_items FOR INSERT TO authenticated
WITH CHECK (invoice_id IN (SELECT i.id FROM public.invoices i WHERE i.company_id = get_user_company_id()) AND get_user_role() IN ('owner','accountant') AND company_has_invoicing(get_user_company_id()));

DROP POLICY IF EXISTS "Invoicers on Pro plan can update invoice items" ON public.invoice_items;
CREATE POLICY "Invoicers on Pro plan can update invoice items"
ON public.invoice_items FOR UPDATE TO authenticated
USING (invoice_id IN (SELECT i.id FROM public.invoices i WHERE i.company_id = get_user_company_id()) AND get_user_role() IN ('owner','accountant') AND company_has_invoicing(get_user_company_id()))
WITH CHECK (invoice_id IN (SELECT i.id FROM public.invoices i WHERE i.company_id = get_user_company_id()) AND get_user_role() IN ('owner','accountant') AND company_has_invoicing(get_user_company_id()));

-- 13. invoice_charges INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Admins on Pro plan can delete invoice charges" ON public.invoice_charges;
CREATE POLICY "Owner can delete invoice charges"
ON public.invoice_charges FOR DELETE TO authenticated
USING (invoice_id IN (SELECT i.id FROM public.invoices i WHERE i.company_id = get_user_company_id()) AND is_caller_owner());

DROP POLICY IF EXISTS "Invoicers on Pro plan can insert invoice charges" ON public.invoice_charges;
CREATE POLICY "Invoicers on Pro plan can insert invoice charges"
ON public.invoice_charges FOR INSERT TO authenticated
WITH CHECK (invoice_id IN (SELECT i.id FROM public.invoices i WHERE i.company_id = get_user_company_id()) AND get_user_role() IN ('owner','accountant') AND company_has_invoicing(get_user_company_id()));

DROP POLICY IF EXISTS "Invoicers on Pro plan can update invoice charges" ON public.invoice_charges;
CREATE POLICY "Invoicers on Pro plan can update invoice charges"
ON public.invoice_charges FOR UPDATE TO authenticated
USING (invoice_id IN (SELECT i.id FROM public.invoices i WHERE i.company_id = get_user_company_id()) AND get_user_role() IN ('owner','accountant') AND company_has_invoicing(get_user_company_id()))
WITH CHECK (invoice_id IN (SELECT i.id FROM public.invoices i WHERE i.company_id = get_user_company_id()) AND get_user_role() IN ('owner','accountant') AND company_has_invoicing(get_user_company_id()));

-- 14. invoice_number_sequences INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Admins on Pro plan can delete sequences" ON public.invoice_number_sequences;
CREATE POLICY "Owner can delete sequences"
ON public.invoice_number_sequences FOR DELETE TO authenticated
USING (company_id = get_user_company_id() AND is_caller_owner());

DROP POLICY IF EXISTS "Invoicers on Pro plan can insert sequences" ON public.invoice_number_sequences;
CREATE POLICY "Invoicers on Pro plan can insert sequences"
ON public.invoice_number_sequences FOR INSERT TO authenticated
WITH CHECK (company_id = get_user_company_id() AND get_user_role() IN ('owner','accountant') AND company_has_invoicing(get_user_company_id()));

DROP POLICY IF EXISTS "Invoicers on Pro plan can update sequences" ON public.invoice_number_sequences;
CREATE POLICY "Invoicers on Pro plan can update sequences"
ON public.invoice_number_sequences FOR UPDATE TO authenticated
USING (company_id = get_user_company_id() AND get_user_role() IN ('owner','accountant') AND company_has_invoicing(get_user_company_id()))
WITH CHECK (company_id = get_user_company_id() AND get_user_role() IN ('owner','accountant') AND company_has_invoicing(get_user_company_id()));