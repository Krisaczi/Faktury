/*
  # Role System Extension

  ## Summary
  Extends role system to support accountant, viewer, and member roles.
  Adds audit trail table for all role changes.

  ## Changes

  ### users table
  - Adds CHECK constraint limiting role values to the canonical set
  - Maps legacy 'user' values to 'member'
  - Adds performance indexes

  ### user_role enum
  - Adds missing values: member, accountant, viewer
    (existing values: user, admin, owner are preserved)

  ### New Table: role_change_logs
  - Immutable audit trail for every role assignment
  - Fields: user_id, changed_by, previous_role, new_role, reason, created_at

  ### Security
  - RLS on role_change_logs
  - Company members can SELECT logs for their company's users
  - Only owner/admin can INSERT logs
*/

-- ─── 1. Extend user_role enum (text-based, add missing values) ────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.user_role'::regtype AND enumlabel = 'member'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'member';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.user_role'::regtype AND enumlabel = 'accountant'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'accountant';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.user_role'::regtype AND enumlabel = 'viewer'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'viewer';
  END IF;
END $$;

-- ─── 2. Keep users.role as text, backfill legacy values, add CHECK ────────────

-- Map legacy 'user' values to 'member'
UPDATE public.users SET role = 'member' WHERE role = 'user';

-- Drop old constraint if exists, then add the authoritative one
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'admin', 'accountant', 'viewer', 'member'));

-- ─── 3. Performance indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_role         ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_company_role ON public.users(company_id, role);

-- ─── 4. role_change_logs ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.role_change_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  changed_by    uuid        NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  previous_role text        NOT NULL,
  new_role      text        NOT NULL,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_change_logs_user_id    ON public.role_change_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_role_change_logs_changed_by ON public.role_change_logs(changed_by);
CREATE INDEX IF NOT EXISTS idx_role_change_logs_created_at ON public.role_change_logs(created_at DESC);

ALTER TABLE public.role_change_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read role change logs"
  ON public.role_change_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users actor
      WHERE actor.id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.users target
          WHERE target.id = role_change_logs.user_id
            AND target.company_id = actor.company_id
        )
    )
  );

CREATE POLICY "Owner or admin can insert role change logs"
  ON public.role_change_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = changed_by
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('owner', 'admin')
    )
  );
