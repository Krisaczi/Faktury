/*
  # Enforce canonical auth/profile creation

  ## Problem
  public.users had no INSERT policy, which means RLS blocked all authenticated
  client inserts correctly — but this was implicit. An explicit policy documents
  the intent, and FORCE ROW LEVEL SECURITY ensures even the table owner (postgres)
  is subject to the same rules when connecting as a non-superuser role.

  The ONLY legitimate ways to create a public.users row are:
  1. The on_auth_user_created trigger (SECURITY DEFINER, runs as postgres).
  2. The complete_user_onboarding RPC (SECURITY DEFINER, runs as postgres).
  3. Service-role connections from server actions (bypasses RLS by design).

  No authenticated client should ever INSERT a public.users row directly.

  ## Changes

  ### 1. Force row security on public.users
  Ensures the table owner (postgres role, used by triggers and RPCs) still goes
  through RLS when acting as a non-superuser. Service role connections set
  request.jwt.claims.role = 'service_role' and still bypass RLS as expected.

  NOTE: FORCE ROW LEVEL SECURITY does NOT affect Supabase SECURITY DEFINER
  functions — those always run as the function owner (postgres superuser) and
  bypass RLS unconditionally. It only affects direct connections as the owner.

  ### 2. Explicit INSERT policy — block all client inserts
  Documents that no authenticated user may INSERT into public.users directly.
  Only service role (server actions) and SECURITY DEFINER functions may write rows.

  ### 3. Explicit INSERT policy on profiles
  Same enforcement for the profiles table.

  ## Security guarantee after this migration
  - Authenticated clients: cannot INSERT into public.users or profiles.
  - Service role (server actions): can INSERT (bypasses RLS).
  - Trigger + RPCs (SECURITY DEFINER): bypass RLS as postgres superuser.
  - No client can create a profile row claiming a different user's auth.uid().
*/

-- ── 1. Force row security on public.users ───────────────────────────────────
-- (This is a documentation/belt-and-suspenders measure; actual auth clients
--  were already blocked because there was no INSERT policy.)
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

-- ── 2. INSERT policy: only service role may insert directly ──────────────────
-- Authenticated clients get no INSERT policy → INSERT is denied.
-- We do NOT add a policy for `TO authenticated` so the implicit deny stands.
-- This comment block serves as the canonical documentation of that intent.
-- The policy below is a no-op for regular clients but makes the intent explicit
-- in pg_policies so auditors can see it.

-- Deny client inserts that don't come through the trigger or RPC.
-- (Having no INSERT policy for 'authenticated' already denies them; this policy
--  is added to profiles which may not have the same enforcement yet.)

-- ── 3. Force row security + INSERT block on profiles ────────────────────────

DO $$
BEGIN
  -- Only apply if profiles table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

    -- Add an INSERT policy only if one doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'profiles'
        AND cmd = 'INSERT'
    ) THEN
      -- Service role bypasses RLS; authenticated clients cannot insert directly.
      -- Trigger (SECURITY DEFINER as postgres) also bypasses RLS.
      -- This policy exists to make the intent explicit in the policy catalog.
      EXECUTE $policy$
        CREATE POLICY "Block direct client inserts"
          ON public.profiles
          FOR INSERT
          TO authenticated
          WITH CHECK (false)
      $policy$;
    END IF;
  END IF;
END $$;

-- ── 4. Add explicit insert-block policy on public.users ──────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND cmd = 'INSERT'
  ) THEN
    CREATE POLICY "Block direct client inserts"
      ON public.users
      FOR INSERT
      TO authenticated
      WITH CHECK (false);
  END IF;
END $$;
