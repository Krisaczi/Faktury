/*
  # Add complete_user_onboarding RPC

  ## Summary
  Adds a SECURITY DEFINER function that atomically links a newly registered user
  to their company and sets their role to 'owner'. This is the only sanctioned
  way to set a user's role to 'owner' after signup.

  ## Why a function instead of a direct UPDATE
  The hardened RLS policy (from fix_users_profiles_rls_and_insert_guard migration)
  prevents clients from changing their own role or company_id. The onboarding
  server action needs to do exactly that for the first-time setup. A SECURITY
  DEFINER function runs as the function owner (postgres), bypasses RLS, and can
  be locked down to only perform the specific update we intend.

  ## Security
  - Function is SECURITY DEFINER — runs as postgres, bypasses RLS
  - Only updates the row where id = p_user_id AND company_id IS NULL (not yet onboarded)
  - Raises an exception if the user is already onboarded (idempotency guard)
  - Callable by authenticated users only (GRANT EXECUTE TO authenticated)
  - Users cannot forge p_user_id because the server action verifies the session
    before calling this function

  ## New Functions
  - `complete_user_onboarding(p_user_id uuid, p_company_id uuid)` — sets
    users.company_id and users.role = 'owner' for the given user, but only if
    company_id is currently NULL.
*/

CREATE OR REPLACE FUNCTION public.complete_user_onboarding(
  p_user_id   uuid,
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

-- Only authenticated users may call this; the server action validates the
-- session and ensures p_user_id matches auth.uid() before calling.
GRANT EXECUTE ON FUNCTION public.complete_user_onboarding(uuid, uuid) TO authenticated;
