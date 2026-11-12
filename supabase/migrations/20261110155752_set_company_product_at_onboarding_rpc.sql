/*
# Let a new company member save its plan during onboarding

1. Problem
- Onboarding saved the chosen plan with a direct update on the companies table.
- Only owners may update companies, so a newly signed-up account (accountant role)
  matched zero rows and no error was reported. The plan stayed on Starter.

2. New function
- `set_company_product_at_onboarding(p_product text)` saves the plan for the
  caller's company and marks onboarding as complete.
- Runs with definer rights but only touches the caller's own company.
- Only allowed while onboarding_step = 'company_created'. Once onboarding is
  complete, the same plan may be re-submitted, but changing it is refused.
- Rejects any value other than 'starter' or 'professional'.

3. Security
- EXECUTE revoked from PUBLIC and anon; granted to authenticated only.
- No change to companies RLS policies.
*/

CREATE OR REPLACE FUNCTION public.set_company_product_at_onboarding(p_product text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_step text;
  v_current text;
BEGIN
  IF p_product NOT IN ('starter', 'professional') THEN
    RAISE EXCEPTION 'INVALID_PRODUCT' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company_id
  FROM users
  WHERE id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY' USING ERRCODE = '42501';
  END IF;

  SELECT onboarding_step, product_type INTO v_step, v_current
  FROM companies
  WHERE id = v_company_id
  FOR UPDATE;

  IF v_step = 'company_created' THEN
    UPDATE companies
    SET product_type = p_product,
        package_type = p_product,
        subscription_status = 'active',
        onboarding_step = 'product_selected',
        updated_at = now()
    WHERE id = v_company_id;
  ELSIF v_step = 'product_selected' AND v_current = p_product THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'ONBOARDING_ALREADY_COMPLETE' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_company_product_at_onboarding(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_company_product_at_onboarding(text) TO authenticated;
