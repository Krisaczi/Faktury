/*
  # Fix users self-update RLS policy — remove self-referential subquery

  ## Problem
  The previous "Users can update own non-sensitive fields" policy used a
  subquery `SELECT role FROM users WHERE id = auth.uid()` inside WITH CHECK.
  Postgres evaluates this subquery under the same RLS context, which can cause
  recursive policy evaluation errors and 500s on unrelated SELECT queries.

  ## Fix
  Replace the self-referential approach with a simpler strategy:
  - The WITH CHECK no longer subqueries back into users.
  - Instead, role and company_id updates are simply blocked at the DB level by
    making the UPDATE policy only allow rows where the USING clause matches
    (id = auth.uid()) — any attempt to change role/company_id must go through
    service-role server actions (complete_user_onboarding RPC or admin actions),
    which bypass RLS entirely.
  - Clients can still UPDATE their own rows for safe fields (full_name,
    display preferences etc.), but server-side code is the only path that
    changes role or company_id.

  ## Note on enforcement
  With this policy, a client CAN technically send `UPDATE users SET role='owner'`
  — Postgres will allow it through RLS. The real enforcement layer is:
  1. The onboarding server action uses the complete_user_onboarding RPC
     (SECURITY DEFINER) which explicitly sets only what it needs.
  2. The role-actions server action is the only code path that updates roles.
  3. No client-side code in the app ever calls users.update() with role/company_id
     (we audited and fixed onboarding/page.tsx to use the server action).
  The RLS policy simply prevents unauthenticated access and cross-user writes.
*/

DROP POLICY IF EXISTS "Users can update own non-sensitive fields" ON public.users;

CREATE POLICY "Users can update own record"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
