/*
  # Fix invoices storage INSERT policy

  The existing INSERT policy on storage.objects for the invoices bucket
  had no WITH CHECK clause, which means Postgres would deny all inserts.

  This migration drops and recreates the policy with a proper WITH CHECK
  that ensures:
  - The bucket is 'invoices'
  - The path starts with companies/
  - The second folder matches the authenticated user's company_id
*/

DROP POLICY IF EXISTS "Company members can upload invoice files" ON storage.objects;

CREATE POLICY "Company members can upload invoice files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] = (get_user_company_id())::text
  );
