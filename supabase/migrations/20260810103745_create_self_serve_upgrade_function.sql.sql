/*
# Create self_serve_upgrade SECURITY DEFINER function

## Purpose
Allows an authenticated user (owner or accountant) to upgrade their company's
package from 'starter' to 'professional' without requiring the service role key
in the application layer. The function runs with database owner privileges via
SECURITY DEFINER, but validates the caller's identity and role internally.

## What it does
1. Looks up the caller's user row by auth.uid()
2. Validates the user has a company_id (not null)
3. Validates the user's role is 'owner' or 'accountant'
4. Looks up the company and checks it's currently on 'starter'
5. Updates the company: product_type, package_type, subscription_status, package_changed_at
6. Inserts a row into billing_audit (old_package, new_package, actor_id)
7. Inserts a row into company_package_audit (previous, next, changed_by)
8. Returns a JSON object with success status and message, or an error code

## Security
- SECURITY DEFINER: runs as the function owner (postgres), bypassing RLS
- Validates auth.uid() internally — no client-supplied user_id
- Only allows upgrade from 'starter' to 'professional'
- Only allows 'owner' and 'accountant' roles
- GRANT EXECUTE only to the 'authenticated' role (not anon)

## Return values
- {"ok": true, "product_type": "professional"} on success
- {"ok": false, "code": "COMPANY_ID_MISSING", "message": "Company id missing in session"} (400)
- {"ok": false, "code": "FORBIDDEN", "message": "Insufficient role to upgrade"} (403)
- {"ok": false, "code": "COMPANY_NOT_FOUND", "message": "Company not found"} (404)
- {"ok": false, "code": "ALREADY_PROFESSIONAL", "message": "Already on Professional plan"} (409)
- {"ok": false, "code": "INVALID_CURRENT_PLAN", "message": "Cannot upgrade from current plan"} (422)
- {"ok": false, "code": "INTERNAL_ERROR", "message": "Internal server error"} (500)
*/

CREATE OR REPLACE FUNCTION public.self_serve_upgrade()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_row record;
  v_company record;
  v_now timestamptz := now();
BEGIN
  -- Guard: must be authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'message', 'Unauthorized');
  END IF;

  -- Look up the user
  SELECT company_id, role INTO v_user_row
  FROM public.users
  WHERE id = v_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'USER_NOT_FOUND', 'message', 'User record not found');
  END IF;

  -- Check company_id exists
  IF v_user_row.company_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'COMPANY_ID_MISSING', 'message', 'Company id missing in session');
  END IF;

  -- Check role is allowed
  IF v_user_row.role NOT IN ('owner', 'accountant') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Insufficient role to upgrade');
  END IF;

  -- Look up the company
  SELECT product_type, package_type INTO v_company
  FROM public.companies
  WHERE id = v_user_row.company_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'COMPANY_NOT_FOUND', 'message', 'Company not found');
  END IF;

  -- Check current plan
  IF COALESCE(v_company.product_type, 'starter') = 'professional' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_PROFESSIONAL', 'message', 'Already on Professional plan');
  END IF;

  IF COALESCE(v_company.product_type, 'starter') != 'starter' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CURRENT_PLAN', 'message', 'Cannot upgrade from current plan');
  END IF;

  -- Perform the upgrade
  UPDATE public.companies
  SET
    product_type      = 'professional',
    package_type      = 'professional',
    subscription_status = 'active',
    package_changed_at = v_now,
    updated_at        = v_now
  WHERE id = v_user_row.company_id;

  -- Write billing_audit
  INSERT INTO public.billing_audit (company_id, actor_id, old_package, new_package, provider, provider_tx_id, created_at)
  VALUES (v_user_row.company_id, v_user_id, 'starter', 'professional', 'internal', NULL, v_now);

  -- Write company_package_audit
  INSERT INTO public.company_package_audit (company_id, changed_by, previous, next, reason, created_at)
  VALUES (
    v_user_row.company_id,
    v_user_id,
    jsonb_build_object('product_type', 'starter', 'package_type', COALESCE(v_company.package_type, 'starter')),
    jsonb_build_object('product_type', 'professional', 'package_type', 'professional'),
    'self_serve_upgrade',
    v_now
  );

  RETURN jsonb_build_object('ok', true, 'product_type', 'professional');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'code', 'INTERNAL_ERROR', 'message', 'Internal server error');
END;
$$;

-- Grant execute only to authenticated users (not anon)
REVOKE ALL ON FUNCTION public.self_serve_upgrade() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.self_serve_upgrade() FROM anon;
GRANT EXECUTE ON FUNCTION public.self_serve_upgrade() TO authenticated;
