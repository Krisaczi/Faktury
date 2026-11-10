DROP POLICY IF EXISTS "company_logos_insert_owner" ON storage.objects;
CREATE POLICY "company_logos_insert_members" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (
    SELECT u.company_id::text FROM users u WHERE u.id = auth.uid()
  )
);

DROP POLICY IF EXISTS "company_logos_update_owner" ON storage.objects;
CREATE POLICY "company_logos_update_members" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (
    SELECT u.company_id::text FROM users u WHERE u.id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (
    SELECT u.company_id::text FROM users u WHERE u.id = auth.uid()
  )
);

DROP POLICY IF EXISTS "company_logos_delete_owner" ON storage.objects;
CREATE POLICY "company_logos_delete_members" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (
    SELECT u.company_id::text FROM users u WHERE u.id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.set_company_logo_path(p_path text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_prefix text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT company_id INTO v_company FROM public.users WHERE id = v_uid;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'COMPANY_ID_MISSING';
  END IF;

  v_prefix := v_company::text || '/';
  IF p_path IS NOT NULL AND (
       left(p_path, length(v_prefix)) <> v_prefix
       OR position('..' in p_path) > 0
       OR length(p_path) > 300
     ) THEN
    RAISE EXCEPTION 'INVALID_LOGO_PATH';
  END IF;

  UPDATE public.companies
     SET logo_path = p_path,
         updated_at = now()
   WHERE id = v_company;

  RETURN p_path;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_company_logo_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_company_logo_path(text) TO authenticated;
