-- Policies on user_status_changes using is_caller_owner() (already defined as stub)
DROP POLICY IF EXISTS "Owners can view status change audit log" ON public.user_status_changes;
CREATE POLICY "Owners can view status change audit log"
  ON public.user_status_changes
  FOR SELECT
  TO authenticated
  USING (public.is_caller_owner());

DROP POLICY IF EXISTS "Block direct client inserts on status changes" ON public.user_status_changes;
CREATE POLICY "Block direct client inserts on status changes"
  ON public.user_status_changes
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- active column + real is_caller_owner() + index — conditional on public.users existing
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    -- active column
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'active'
    ) THEN
      EXECUTE 'ALTER TABLE public.users ADD COLUMN active boolean NOT NULL DEFAULT true';
    END IF;

    -- index on inactive users
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_active ON public.users (active) WHERE active = false';

    -- FK constraints on user_status_changes (safe to re-add with IF NOT EXISTS guard)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'user_status_changes_target_user_id_fkey'
    ) THEN
      EXECUTE 'ALTER TABLE public.user_status_changes
               ADD CONSTRAINT user_status_changes_target_user_id_fkey
               FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE CASCADE';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'user_status_changes_changed_by_fkey'
    ) THEN
      EXECUTE 'ALTER TABLE public.user_status_changes
               ADD CONSTRAINT user_status_changes_changed_by_fkey
               FOREIGN KEY (changed_by) REFERENCES public.users(id)';
    END IF;
  END IF;
END $$;

-- Real is_caller_owner() — safe to create even without public.users because
-- the plpgsql body is not validated at function-creation time.
CREATE OR REPLACE FUNCTION public.is_caller_owner()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id  = auth.uid()
      AND u.role = 'owner'
      AND u.active = true
  );
END;
$$;
