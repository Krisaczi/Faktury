/*
  # Fix users_single_owner: one owner per company, not one owner globally

  ## Problem
  The original index was:
    CREATE UNIQUE INDEX users_single_owner ON public.users (role) WHERE role = 'owner'
  This indexes only `role`, not `company_id`. Since the partial index filter
  is `WHERE role = 'owner'`, the index allows **at most one owner row in the
  entire database** — not one owner per company. Any attempt to create or
  update a second owner (even in a different company) fails with:
    "duplicate key value violates unique constraint users_single_owner"

  ## Fix
  1. Drop the broken index.
  2. Clean up any duplicate owner rows (demote extras to accountant, keeping
     the oldest one per company as the legitimate owner).
  3. Create a correct partial unique index on `(company_id) WHERE role = 'owner'`
     so each company can have at most one owner.
  4. Harden the `grant_owner_role` DB function to atomically demote the
     existing owner before promoting the new one, preventing race conditions.

  ## Verification
  After applying, run:
    SELECT company_id, count(*) FROM users WHERE role='owner' GROUP BY company_id;
  Every company_id should show count = 1 (or 0 if no owner yet).
*/

-- ── 1. Drop the broken index ──────────────────────────────────────────────────
DROP INDEX IF EXISTS public.users_single_owner;

-- ── 2. Clean up duplicate owners (keep oldest per company) ────────────────────
-- For each company that has more than one owner, demote all but the oldest
-- to 'accountant'. This is safe: the oldest owner is the one who created
-- the company via onboarding.
UPDATE public.users
SET role = 'accountant', updated_at = now()
WHERE role = 'owner'
  AND id NOT IN (
    SELECT DISTINCT ON (company_id) id
    FROM public.users
    WHERE role = 'owner' AND company_id IS NOT NULL
    ORDER BY company_id, created_at ASC
  )
  AND company_id IS NOT NULL;

-- ── 3. Create the correct partial unique index ────────────────────────────────
-- One owner per company. company_id must be NOT NULL for this to work
-- (a NULL company_id owner would be excluded from the unique constraint,
-- which is fine — onboarding sets company_id before role='owner').
CREATE UNIQUE INDEX users_single_owner
  ON public.users (company_id)
  WHERE role = 'owner';

-- ── 4. Harden grant_owner_role to atomically swap ownership ───────────────────
-- The function now demotes the existing owner (if any) to 'admin' before
-- promoting the new owner. This prevents a constraint violation when
-- transferring ownership and ensures the partial unique index is never
-- violated within the function's transaction.
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
  v_existing_owner_id  uuid;
  v_existing_prev_role text;
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
    -- Already owner — no-op
    RETURN;
  END IF;

  -- Demote the existing owner (if any) to 'admin' before promoting the new
  -- one. This keeps the partial unique index satisfied within the same
  -- transaction.
  SELECT id, role INTO v_existing_owner_id, v_existing_prev_role
  FROM public.users
  WHERE company_id = v_caller_company_id
    AND role = 'owner'
    AND id IS DISTINCT FROM p_target_user_id
  LIMIT 1;

  IF v_existing_owner_id IS NOT NULL THEN
    UPDATE public.users
    SET role = 'admin', updated_at = now()
    WHERE id = v_existing_owner_id;

    INSERT INTO public.role_change_logs (user_id, changed_by, previous_role, new_role, reason)
    VALUES (v_existing_owner_id, p_caller_id, 'owner', 'admin',
      COALESCE(p_reason, 'ownership transfer — demoted to make room for new owner'));
  END IF;

  -- Promote the target to owner
  UPDATE public.users
  SET role = 'owner', updated_at = now()
  WHERE id = p_target_user_id;

  -- Write audit log for the promotion
  INSERT INTO public.role_change_logs (user_id, changed_by, previous_role, new_role, reason)
  VALUES (p_target_user_id, p_caller_id, v_previous_role, 'owner', p_reason);
END;
$$;

-- Re-apply grants (function signature unchanged, but re-grant for safety)
REVOKE ALL ON FUNCTION public.grant_owner_role(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_owner_role(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_owner_role(uuid, uuid, text) TO service_role;
