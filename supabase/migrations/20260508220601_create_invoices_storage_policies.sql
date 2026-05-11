/*
  # Invoices Storage Bucket RLS Policies

  Creates RLS policies on the `invoices` storage bucket so that
  only authenticated users who belong to the matching company can
  read, upload, or delete files stored under:
    companies/{company_id}/uploads/...

  All policies use get_user_company_id() to resolve the caller's tenant.
*/

-- SELECT: company members can read their own files
CREATE POLICY "Company members can read invoice files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] = (get_user_company_id())::text
  );

-- INSERT: company members can upload files into their company folder
CREATE POLICY "Company members can upload invoice files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] = (get_user_company_id())::text
  );

-- DELETE: company admins can delete files
CREATE POLICY "Company admins can delete invoice files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] = (get_user_company_id())::text
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
