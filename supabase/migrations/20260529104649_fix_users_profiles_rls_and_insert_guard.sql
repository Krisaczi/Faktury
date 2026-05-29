/*
  # Harden RLS on users and profiles tables

  ## Summary
  Removes overly-permissive INSERT policies on `users` and `profiles` that
  allowed any authenticated client to insert rows directly, bypassing the
  `handle_new_user` trigger which is the sole intended creation path.

  Also restricts the self-update policy on `users` so clients can only update
  safe columns (display preferences), not security-sensitive ones like `role`
  or `company_id`. Those fields are managed exclusively by server actions.

  ## Changes

  ### public.users
  - DROP "Users can insert own record" — trigger handles all inserts; no client
    insert should ever be needed. This also closes the vector where a client
    could re-insert a row with a crafted role.
  - DROP "Users can update own record" — replaced with a narrower policy that
    blocks self-promotion of role or company_id.
  - ADD  "Users can update own non-sensitive fields" — allows UPDATE only when
    the modified row belongs to the caller AND the update does not change role
    or company_id (enforced via WITH CHECK column-level guard).
  - The "Admins can update company members" policy is untouched (owners/admins
    updating others' roles via the role-actions server action).

  ### public.profiles
  - DROP "Users can insert own profile" — trigger handles all inserts.
  - The existing SELECT and UPDATE policies are unchanged.

  ## Security notes
  - INSERT on both tables is now only possible via the SECURITY DEFINER trigger
    (runs as postgres, bypasses RLS) or the service-role server client.
  - Clients can still UPDATE their own display-level profile fields but cannot
    touch role, company_id, or any other user they don't own.
*/

-- ─── 1. users: remove client INSERT policy ───────────────────────────────────

DROP POLICY IF EXISTS "Users can insert own record" ON public.users;

-- ─── 2. users: drop old open self-update, replace with safe version ───────────

DROP POLICY IF EXISTS "Users can update own record" ON public.users;

CREATE POLICY "Users can update own non-sensitive fields"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Prevent self-promotion: role and company_id must not be changed
    -- by the user themselves. Server actions (service role) bypass RLS.
    AND role = (SELECT role FROM public.users WHERE id = auth.uid())
    AND (
      company_id IS NOT DISTINCT FROM
      (SELECT company_id FROM public.users WHERE id = auth.uid())
    )
  );

-- ─── 3. profiles: remove client INSERT policy ────────────────────────────────

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
