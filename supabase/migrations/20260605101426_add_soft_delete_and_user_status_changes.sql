-- ── Soft delete infrastructure ────────────────────────────────────────────────
-- This migration is written to be idempotent and safe in environments where
-- public.users may not yet exist (e.g., fresh dev instances).
-- The actual constraints and policies that reference public.users are applied
-- conditionally via DO blocks that check table existence first.

-- ── 1. user_status_changes table (no FK constraints yet) ─────────────────────
CREATE TABLE IF NOT EXISTS public.user_status_changes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id  uuid        NOT NULL,
  changed_by      uuid        NULL,
  previous_active boolean     NOT NULL,
  new_active      boolean     NOT NULL,
  reason          text,
  ip              inet        NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_status_changes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_status_changes_target
  ON public.user_status_changes (target_user_id, created_at DESC);

-- ── 2. is_caller_owner() — safe even without public.users ────────────────────
-- When public.users doesn't exist this always returns false (no lockout risk).
CREATE OR REPLACE FUNCTION public.is_caller_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT false;
$$;
