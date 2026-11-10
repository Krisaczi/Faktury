DROP FUNCTION IF EXISTS public.self_serve_upgrade_to_professional();

CREATE OR REPLACE FUNCTION public.self_serve_upgrade()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_role    text;
  v_current text;
  v_now     timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT u.company_id, u.role INTO v_company, v_role
  FROM users u WHERE u.id = v_uid;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'COMPANY_ID_MISSING' USING ERRCODE = 'P0001';
  END IF;

  IF v_role NOT IN ('owner', 'accountant') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT c.product_type INTO v_current
  FROM companies c WHERE c.id = v_company FOR UPDATE;

  IF v_current = 'professional' THEN
    RAISE EXCEPTION 'ALREADY_PROFESSIONAL' USING ERRCODE = 'P0001';
  END IF;

  UPDATE companies SET
    product_type        = 'professional',
    package_type        = 'professional',
    package_assigned_at = v_now,
    updated_at          = v_now
  WHERE id = v_company;

  UPDATE plan_assignments SET
    plan_id        = 'professional',
    effective_from = v_now,
    updated_at     = v_now,
    metadata       = '{"source": "self_serve"}'::jsonb
  WHERE entity_id = v_company AND entity_type = 'company' AND status = 'active';

  IF NOT FOUND THEN
    INSERT INTO plan_assignments (entity_id, entity_type, plan_id, status, effective_from, updated_at, metadata)
    VALUES (v_company, 'company', 'professional', 'active', v_now, v_now, '{"source": "self_serve"}'::jsonb);
  END IF;

  INSERT INTO billing_audit (company_id, actor_id, old_package, new_package, provider, event_type, from_plan, to_plan, changed_by, metadata)
  VALUES (v_company, v_uid, COALESCE(v_current, 'starter'), 'professional', 'local', 'plan_changed',
          COALESCE(v_current, 'starter'), 'professional', v_uid, '{"source": "self_serve"}'::jsonb);

  RETURN jsonb_build_object('product_type', 'professional');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.self_serve_upgrade() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_serve_upgrade() TO authenticated;
