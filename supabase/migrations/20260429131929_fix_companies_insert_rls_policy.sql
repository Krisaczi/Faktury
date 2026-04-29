/*
  # Fix companies INSERT RLS policy

  ## Summary
  The original INSERT policy on the companies table checked that the new company's
  id already existed in the users table as the caller's company_id. This is a
  chicken-and-egg problem: during onboarding the user has no company_id yet, so
  the check always fails and the insert is blocked.

  ## Changes
  - Drop the broken "Company members can insert their company" policy
  - Ensure "Authenticated users can create a company" policy exists with WITH CHECK (true)
    so any authenticated user can create a company during onboarding
*/

-- Drop the broken policy if it still exists (idempotent)
DROP POLICY IF EXISTS "Company members can insert their company" ON companies;

-- Ensure the correct open INSERT policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'companies'
      AND cmd = 'INSERT'
      AND policyname = 'Authenticated users can create a company'
  ) THEN
    CREATE POLICY "Authenticated users can create a company"
      ON companies FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;
