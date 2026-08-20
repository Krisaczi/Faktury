/*
# Fix: Allow owner to update any company for plan reconciliation

## Problem
The `companies` UPDATE policy "Owners can update own company" checks
`id = get_user_company_id()`, meaning the owner can only update their own
company. When `forceSyncUser` or `reconcileUser` tries to update the
target user's company (a different company), RLS blocks the update and
the API returns 500.

## Fix
Add a new UPDATE policy allowing owners to update any company.
This is needed for plan reconciliation and force-sync flows where the
owner modifies another user's company plan fields.
*/

DROP POLICY IF EXISTS "Owners can update any company for reconciliation" ON companies;
CREATE POLICY "Owners can update any company for reconciliation"
  ON companies FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'owner'));
