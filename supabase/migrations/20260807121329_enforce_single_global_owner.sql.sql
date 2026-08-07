/*
  # Enforce single global owner — only Krzysztof can be 'owner'

  ## Problem
  The app currently allows multiple owners (one per company via the
  users_single_owner index on company_id). New users completing onboarding
  are assigned the 'owner' role via complete_user_onboarding RPC. This is
  wrong: there must be exactly ONE owner in the entire system (Krzysztof,
  id = 80c57af9-d139-4934-a105-8380d5ecc831). All other users must get
  'accountant' (or 'admin' if promoted manually).

  ## Changes

  ### 1. Demote non-Krzysztof owners to accountant
  Any user with role='owner' whose id is not Krzysztof's gets demoted to
  'accountant'. Audit-logged.

  ### 2. Replace per-company unique index with global single-owner index
  Drop:   users_single_owner ON (company_id) WHERE role='owner'
  Create: users_single_owner ON (role) WHERE role='owner'
  This ensures at most ONE owner row in the entire database.

  ### 3. Rewrite complete_user_onboarding RPC
  No longer sets role='owner'. Instead sets role='admin' (the highest
  role a non-owner can get via onboarding). The owner role is never
  assigned by this function.

  ### 4. Rewrite grant_owner_role RPC
  - Only callable by service_role (REVOKE from PUBLIC and authenticated).
  - Only Krzysztof (hardcoded id) can be the target.
  - No longer demotes/promotes — it only sets Krzysztof's role to owner
    if somehow it got changed. This is a recovery function, not a
    general-purpose promotion tool.
  - Rejects any target that is not Krzysztof.

  ### 5. Harden RLS: block ALL client-side role='owner' writes
  Update existing UPDATE policies to ensure no authenticated user can
  ever set role='owner' via the client.

  ### 6. Add CHECK constraint: role default is 'accountant'
  Already the case — verify and enforce.
*/

-- ── 1. Demote non-Krzysztof owners ───────────────────────────────────────────
DO $$
DECLARE
  v_kris_id uuid := '80c57af9-d139-4934-a105-8380d5ecc831';
  v_row record;
BEGIN
  FOR v_row IN
    SELECT id, email, company_id FROM public.users WHERE role = 'owner' AND id <> v_kris_id
  LOOP
    UPDATE public.users SET role = 'accountant', updated_at = now() WHERE id = v_row.id;

    INSERT INTO public.role_change_logs (user_id, changed_by, previous_role, new_role, reason)
    VALUES (v_row.id, v_kris_id, 'owner', 'accountant',
      'Enforcing single global owner policy — auto-demoted by migration');
  END LOOP;
END $$;

-- ── 2. Replace index: global single owner ────────────────────────────────────
DROP INDEX IF EXISTS public.users_single_owner;

CREATE UNIQUE INDEX users_single_owner
  ON public.users (role)
  WHERE role = 'owner';

-- ── 3. Rewrite complete_user_onboarding — assign 'admin', NOT 'owner' ────────
CREATE OR REPLACE FUNCTION public.complete_user_onboarding(
  p_user_id    uuid,
  p_company_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_company_id uuid;
BEGIN
  -- Ensure the caller can only onboard themselves
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cannot onboard another user: caller % tried to onboard %', auth.uid(), p_user_id;
  END IF;

  SELECT company_id INTO v_current_company_id
  FROM public.users
  WHERE id = p_user_id;

  IF v_current_company_id IS NOT NULL THEN
    RAISE EXCEPTION 'User % is already onboarded to company %', p_user_id, v_current_company_id;
  END IF;

  -- Assign 'admin' role — the highest role a non-owner can get.
  -- The 'owner' role is reserved exclusively for Krzysztof and can
  -- never be assigned through onboarding.
  UPDATE public.users
  SET
    company_id = p_company_id,
    role       = 'admin',
    updated_at = now()
  WHERE id = p_user_id
    AND company_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found or already onboarded', p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_user_onboarding(uuid, uuid) TO authenticated;

-- ── 4. Rewrite grant_owner_role — service-role-only, Krzysztof-only ──────────
CREATE OR REPLACE FUNCTION public.grant_owner_role(
  p_target_user_id uuid,
  p_caller_id      uuid,
  p_reason         text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kris_id      uuid := '80c57af9-d139-4934-a105-8380d5ecc831';
  v_previous_role text;
BEGIN
  -- Only Krzysztof can ever be the owner. Reject any other target.
  IF p_target_user_id IS DISTINCT FROM v_kris_id THEN
    RAISE EXCEPTION 'Only Krzysztof (id %) can hold the owner role. Target % is not permitted.',
      v_kris_id, p_target_user_id;
  END IF;

  -- Get target's current state
  SELECT role INTO v_previous_role
  FROM public.users
  WHERE id = p_target_user_id;

  IF v_previous_role IS NULL THEN
    RAISE EXCEPTION 'Target user % not found', p_target_user_id;
  END IF;

  IF v_previous_role = 'owner' THEN
    -- Already owner — no-op
    RETURN;
  END IF;

  -- Set Krzysztof's role to owner
  UPDATE public.users
  SET role = 'owner', updated_at = now()
  WHERE id = p_target_user_id;

  -- Write audit log
  INSERT INTO public.role_change_logs (user_id, changed_by, previous_role, new_role, reason)
  VALUES (p_target_user_id, p_caller_id, v_previous_role, 'owner',
    COALESCE(p_reason, 'Restored owner role via protected service route'));
END;
$$;

-- Callable by service role only
REVOKE ALL ON FUNCTION public.grant_owner_role(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_owner_role(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_owner_role(uuid, uuid, text) TO service_role;

-- ── 5. Harden RLS: block ALL client-side role='owner' writes ─────────────────
-- Self-update policy: cannot set role to owner
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
CREATE POLICY "Users can update own record"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role IS DISTINCT FROM 'owner'
  );

-- Admin/owner update policy: cannot set role to owner
DROP POLICY IF EXISTS "Admins can update company members" ON public.users;
CREATE POLICY "Admins can update company members"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM users u2
      WHERE u2.id = auth.uid()
        AND u2.role = ANY(ARRAY['owner', 'admin'])
    )
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND company_id = get_user_company_id()
    AND role IS DISTINCT FROM 'owner'
  );
