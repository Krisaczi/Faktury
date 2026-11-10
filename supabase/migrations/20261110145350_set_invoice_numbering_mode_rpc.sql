CREATE OR REPLACE FUNCTION public.set_invoice_numbering_mode(p_mode text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_mode NOT IN ('auto', 'manual') THEN
    RAISE EXCEPTION 'INVALID_MODE';
  END IF;

  SELECT company_id INTO v_company FROM public.users WHERE id = v_uid;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'COMPANY_ID_MISSING';
  END IF;

  UPDATE public.companies
     SET invoice_numbering_mode = p_mode,
         updated_at = now()
   WHERE id = v_company;

  RETURN p_mode;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_invoice_numbering_mode(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_invoice_numbering_mode(text) TO authenticated;
