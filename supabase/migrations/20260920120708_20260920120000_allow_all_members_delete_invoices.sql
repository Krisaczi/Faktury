/*
# Allow all company members to delete invoices

1. Changes
- Replaces the "Owner can delete invoices" RLS policy on `invoices` with
  a new policy that allows any authenticated company member to delete
  invoices belonging to their own company.
- The existing `delete_invoices_starter_block` policy (which blocks
  deletes on Starter-tier companies) remains in effect, so Starter
  users are still gated by their plan.
2. Security
- DELETE on `invoices` now requires `company_id = get_user_company_id()`
  (same company membership check as SELECT/UPDATE) instead of
  `is_caller_owner()`.
- Starter-tier plan enforcement is preserved.
*/

DROP POLICY IF EXISTS "Owner can delete invoices" ON public.invoices;

CREATE POLICY "Company members can delete invoices"
  ON public.invoices
  FOR DELETE
  TO authenticated
  USING (company_id = get_user_company_id());
