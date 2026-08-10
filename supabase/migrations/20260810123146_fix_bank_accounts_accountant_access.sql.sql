/*
# Fix company_bank_accounts RLS policies for accountant access

## Purpose
Accountants were blocked from creating, updating, and deleting bank accounts
because all write RLS policies required `users.role = 'owner'`. This migration
rewrites those policies to allow both 'owner' and 'accountant' roles.

## Changes
- DROP all 4 existing RLS policies on company_bank_accounts (all required 'owner')
- CREATE 4 new policies with role check `IN ('owner', 'accountant')`
- SELECT remains company-scoped (any company member can read)
- INSERT/UPDATE/DELETE require owner or accountant role + company membership

## Security
- Anon role fully denied (no policies grant to anon)
- Cross-company access prevented via `company_id = get_user_company_id()` check
- The delete-with-force path (when invoices reference the account) still requires
  owner role — enforced in the application layer, not RLS
*/

DROP POLICY IF EXISTS "delete_company_bank_accounts" ON public.company_bank_accounts;
DROP POLICY IF EXISTS "insert_company_bank_accounts" ON public.company_bank_accounts;
DROP POLICY IF EXISTS "select_company_bank_accounts" ON public.company_bank_accounts;
DROP POLICY IF EXISTS "update_company_bank_accounts" ON public.company_bank_accounts;

-- SELECT: any company member can read
CREATE POLICY "select_company_bank_accounts"
  ON public.company_bank_accounts FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id());

-- INSERT: owner or accountant
CREATE POLICY "insert_company_bank_accounts"
  ON public.company_bank_accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'accountant')
    )
  );

-- UPDATE: owner or accountant
CREATE POLICY "update_company_bank_accounts"
  ON public.company_bank_accounts FOR UPDATE
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'accountant')
    )
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'accountant')
    )
  );

-- DELETE: owner or accountant
CREATE POLICY "delete_company_bank_accounts"
  ON public.company_bank_accounts FOR DELETE
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'accountant')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_bank_accounts TO authenticated;
