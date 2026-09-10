/*
# Allow platform owner to read KSeF credentials across companies

## Context
The platform owner submits invoices on behalf of other companies to KSeF.
The existing RLS policy on ksef_credentials only allows reading credentials
where `company_id = get_user_company_id()`, which blocks the owner from
reading another company's credentials when submitting their invoices.

## Changes
1. Adds a SELECT policy allowing the global platform owner (role = 'owner')
   to read KSeF credentials for any company.
2. Existing company-scoped policies remain unchanged for all other users.

## Security
- Only the single global owner (users.role = 'owner') gains cross-company SELECT.
- All other users (accountants, etc.) are still restricted to their own company.
- No INSERT/UPDATE/DELETE changes — owner already has those via existing policies
  for their own company, and cross-company writes are not needed.
*/

DROP POLICY IF EXISTS "Owner can read all KSeF credentials" ON ksef_credentials;

CREATE POLICY "Owner can read all KSeF credentials"
ON ksef_credentials FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role = 'owner'
  )
);
