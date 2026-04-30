/*
  # Recreate companies INSERT RLS policy

  The existing policy may have been created in a broken state. Drop and recreate it
  cleanly to ensure authenticated users can insert new companies during onboarding.
*/

DROP POLICY IF EXISTS "Authenticated users can create a company" ON companies;
DROP POLICY IF EXISTS "Company members can insert their company" ON companies;

CREATE POLICY "Authenticated users can create a company"
  ON companies
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
