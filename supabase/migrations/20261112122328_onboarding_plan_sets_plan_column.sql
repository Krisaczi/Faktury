/*
# Save the onboarding plan to both plan fields

1. Problem
- `set_company_product_at_onboarding` stored the chosen plan in `product_type`
  and `package_type` only. The `plan` column stayed at its default ('starter'),
  so records could show a mismatch between the selected and saved plan.

2. Change
- The function now also sets `companies.plan` to the selected value.
- Behaviour is otherwise unchanged: only the caller's own company, only while
  onboarding_step = 'company_created', only 'starter' or 'professional'.

3. Security
- Same grants as before: EXECUTE for authenticated only.
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
        plan = p_product,
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
