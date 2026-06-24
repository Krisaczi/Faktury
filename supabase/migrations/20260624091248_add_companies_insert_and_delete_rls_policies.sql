-- Allow authenticated users to INSERT a new company during onboarding.
-- The user must not already belong to a company (enforced in the onboarding action,
-- but belt-and-suspenders here via the RPC that links them immediately after insert).
CREATE POLICY "Authenticated users can create a company"
  ON public.companies FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow owners to delete their own company (used for rollback in onboarding action).
CREATE POLICY "Owners can delete own company"
  ON public.companies FOR DELETE
  TO authenticated
  USING (
    id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'owner'
    )
  );
