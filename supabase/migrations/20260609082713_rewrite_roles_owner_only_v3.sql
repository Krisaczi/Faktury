-- ============================================================
-- Rewrite role system: owner / admin / accountant only
-- (role column is text — no enum migration required)
-- ============================================================

-- ── 1. Backfill legacy roles to accountant ───────────────────────────────────
UPDATE public.users
SET role = 'accountant',
    updated_at = now()
WHERE role IN ('viewer', 'member', 'user');

-- ── 2. Update column default ─────────────────────────────────────────────────
ALTER TABLE public.users
  ALTER COLUMN role SET DEFAULT 'accountant';

-- ── 3. Add CHECK constraint limiting valid roles ─────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.users
    ADD CONSTRAINT users_role_valid
    CHECK (role IN ('owner', 'admin', 'accountant'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 4. Owner singleton unique index ──────────────────────────────────────────
DO $$ BEGIN
  CREATE UNIQUE INDEX users_single_owner
    ON public.users (role)
    WHERE role = 'owner';
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ── 5. Replace is_caller_owner() ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_caller_owner()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   text;
  v_active boolean;
BEGIN
  SELECT role, active
    INTO v_role, v_active
    FROM public.users
   WHERE id = auth.uid()
   LIMIT 1;

  RETURN v_role = 'owner' AND v_active = true;
END;
$$;

-- ── 6. Update handle_new_user trigger — default accountant ───────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'accountant')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── 7. Drop + recreate users UPDATE policies ─────────────────────────────────
-- The old policies allowed admins to update members; now only owner can change
-- role or active. Admins can update other non-privileged fields of same-company users.

DROP POLICY IF EXISTS "Admins can update company members" ON public.users;
DROP POLICY IF EXISTS "Users can update own record"       ON public.users;

-- Only owner (via service role or is_caller_owner) may change role or active.
-- Admins may update non-privileged fields of company members.
-- Regular users may update only their own non-privileged fields.

CREATE POLICY "Owner can update any company member"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = get_user_company_id()
    AND is_caller_owner()
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND company_id = get_user_company_id()
    AND role <> 'owner'
  );

CREATE POLICY "Admins can update non-privileged fields"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = get_user_company_id()
    AND (EXISTS (
      SELECT 1 FROM public.users u2
       WHERE u2.id = auth.uid()
         AND u2.role = 'admin'
    ))
    AND id <> auth.uid()
    AND role <> 'owner'
  )
  WITH CHECK (
    -- Admins cannot change role or active — those are owner-only
    role = (SELECT role FROM public.users WHERE id = users.id LIMIT 1)
    AND active = (SELECT active FROM public.users WHERE id = users.id LIMIT 1)
  );

CREATE POLICY "Users can update own non-privileged fields"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1)
    AND active = (SELECT active FROM public.users WHERE id = auth.uid() LIMIT 1)
  );

-- ── 8. Fix issued_invoices / items policies that referenced 'viewer' ─────────

DROP POLICY IF EXISTS "Company members can view issued invoices"   ON public.issued_invoices;
DROP POLICY IF EXISTS "Company members can view invoice items"     ON public.issued_invoice_items;

CREATE POLICY "Company members can view issued invoices"
  ON public.issued_invoices
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT u.company_id FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role IN ('owner', 'admin', 'accountant')
    )
  );

CREATE POLICY "Company members can view invoice items"
  ON public.issued_invoice_items
  FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT ii.id FROM public.issued_invoices ii
       WHERE ii.company_id IN (
         SELECT u.company_id FROM public.users u
          WHERE u.id = auth.uid()
            AND u.role IN ('owner', 'admin', 'accountant')
       )
    )
  );

-- ── 9. Fix role_change_logs INSERT policy — owner-only ───────────────────────
DROP POLICY IF EXISTS "Owner or admin can insert role change logs" ON public.role_change_logs;

CREATE POLICY "Owner can insert role change logs"
  ON public.role_change_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = changed_by
    AND is_caller_owner()
  );

-- ── 10. Backfill audit rows for the migration ────────────────────────────────
-- (Already backfilled in step 1; no audit rows for the system migration itself
--  since there is no caller user_id available here. The server action will write
--  audit rows for future role changes.)
