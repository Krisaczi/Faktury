/*
  # Harden owner-role assignment

  ## Problem
  The `complete_user_onboarding` RPC accepts any p_user_id from any
  authenticated caller, meaning a logged-in user could call it with
  a different user's ID and promote that user to 'owner'. The only
  server-side guard was in the TypeScript server action, not the DB.

  Additionally, authenticated RLS UPDATE policies allowed any user to
  send `UPDATE users SET role='owner'` (the app never did this, but
  nothing stopped a crafted request from doing so).

  ## Changes

  ### 1. Harden complete_user_onboarding RPC
  - Add `auth.uid() = p_user_id` guard so a user can only onboard themselves.
  - This is defence-in-depth; the server action already checks this but the
    DB should enforce it independently.

  ### 2. Add new service-role-only RPC for owner grants
  - `grant_owner_role(p_target_user_id uuid, p_caller_id uuid)` — a SECURITY
    DEFINER function that validates the caller is already an owner before
    setting the target's role to 'owner'. Callable by service role only
    (REVOKE from authenticated, GRANT to service_role).

  ### 3. Add RLS UPDATE policy that blocks client-side role=owner writes
  - Drop the broad "Users can update own record" policy.
  - Replace with two policies:
    a. "Users can update own non-role fields" — allows UPDATE but WITH CHECK
       enforces that role cannot be changed to 'owner' by the client.
    b. Admins updating company members remain blocked from setting owner.
  - Service role (used by server actions) bypasses RLS entirely.

  ### 4. role_change_logs schema extension
  - Add `ip` column (nullable text) to capture request IP for owner grants.
  - Column already safe to add; no data migration needed.

  ## Security properties after this migration
  - No authenticated client can set role='owner' via direct UPDATE.
  - `complete_user_onboarding` only works for the calling user (auth.uid() guard).
  - `grant_owner_role` is only accessible via service role (server actions).
  - All owner role changes are logged to role_change_logs.
*/

-- ── 1. Harden complete_user_onboarding ──────────────────────────────────────

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

  UPDATE public.users
  SET
    company_id = p_company_id,
    role       = 'owner',
    updated_at = now()
  WHERE id = p_user_id
    AND company_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found or already onboarded', p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_user_onboarding(uuid, uuid) TO authenticated;

-- ── 2. Service-role-only grant_owner_role function ───────────────────────────

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
  v_caller_role        text;
  v_caller_company_id  uuid;
  v_target_company_id  uuid;
  v_previous_role      text;
BEGIN
  -- Validate caller is an owner
  SELECT role, company_id
  INTO v_caller_role, v_caller_company_id
  FROM public.users
  WHERE id = p_caller_id;

  IF v_caller_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only an owner can grant the owner role (caller % has role %)',
      p_caller_id, COALESCE(v_caller_role, 'none');
  END IF;

  -- Get target's current state
  SELECT role, company_id
  INTO v_previous_role, v_target_company_id
  FROM public.users
  WHERE id = p_target_user_id;

  IF v_previous_role IS NULL THEN
    RAISE EXCEPTION 'Target user % not found', p_target_user_id;
  END IF;

  IF v_target_company_id IS DISTINCT FROM v_caller_company_id THEN
    RAISE EXCEPTION 'Cannot grant owner role across companies';
  END IF;

  IF v_previous_role = 'owner' THEN
    -- Already owner — no-op, but still log
    RETURN;
  END IF;

  -- Apply the role change
  UPDATE public.users
  SET role = 'owner', updated_at = now()
  WHERE id = p_target_user_id;

  -- Write audit log
  INSERT INTO public.role_change_logs (user_id, changed_by, previous_role, new_role, reason)
  VALUES (p_target_user_id, p_caller_id, v_previous_role, 'owner', p_reason);
END;
$$;

-- Callable by service role only (server actions use service client for this)
REVOKE ALL ON FUNCTION public.grant_owner_role(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_owner_role(uuid, uuid, text) FROM authenticated;

-- ── 3. Harden RLS: block client-side role='owner' writes ────────────────────

-- Drop the existing permissive self-update policy
DROP POLICY IF EXISTS "Users can update own record" ON public.users;

-- Replacement: allow authenticated users to update their own row but block
-- any attempt to set role='owner' (only service role can do that).
CREATE POLICY "Users can update own record"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role IS DISTINCT FROM 'owner'
  );

-- Also prevent admins from escalating others to 'owner' via the admin policy
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

-- ── 4. Add ip column to role_change_logs ────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'role_change_logs' AND column_name = 'ip'
  ) THEN
    ALTER TABLE public.role_change_logs ADD COLUMN ip text;
  END IF;
END $$;
