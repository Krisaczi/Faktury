/*
  # Role Switch Infrastructure

  ## Purpose
  Allows owners to temporarily assume another role (admin, accountant, viewer)
  for UI and functionality testing without changing their permanent role in `users`.

  ## New Tables

  ### role_switch_logs
  Immutable audit record of every role switch lifecycle event.
  - `id`            — PK
  - `owner_id`      — FK → users(id), the owner who initiated the switch
  - `assumed_role`  — the role temporarily assumed
  - `previous_role` — the owner's real role at time of switch
  - `reason`        — optional free-text reason
  - `started_at`    — when the switch started
  - `expires_at`    — when the switch should auto-expire
  - `reverted_at`   — when the owner explicitly reverted (null if auto-expired)
  - `revoked_by`    — who revoked it (same as owner_id for self-revert)
  - `ip`            — client IP at start time
  - `created_at`    — row creation timestamp

  ### role_switch_sessions
  Live ephemeral session table. Rows are deleted on revert or expiry.
  - `token`         — PK, opaque UUID stored in the HttpOnly cookie
  - `owner_id`      — FK → users(id)
  - `assumed_role`  — effective role while session is active
  - `expires_at`    — expiry timestamp; getEffectiveRole() checks this on every call
  - `created_at`    — row creation timestamp

  ## Security
  - RLS: owners can only read/delete their own sessions
  - Logs: owners can read their own log entries; inserts are owner-scoped
  - Sessions table rows are tiny and short-lived; no UPDATE policy (delete-on-revert)
*/

-- ─── role_switch_logs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.role_switch_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assumed_role  text        NOT NULL,
  previous_role text        NOT NULL,
  reason        text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  reverted_at   timestamptz,
  revoked_by    uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS role_switch_logs_owner_id_idx    ON public.role_switch_logs (owner_id);
CREATE INDEX IF NOT EXISTS role_switch_logs_expires_at_idx  ON public.role_switch_logs (expires_at);

ALTER TABLE public.role_switch_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read own switch logs"
  ON public.role_switch_logs FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can insert own switch logs"
  ON public.role_switch_logs FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update own switch logs"
  ON public.role_switch_logs FOR UPDATE
  TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ─── role_switch_sessions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.role_switch_sessions (
  token        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assumed_role text        NOT NULL,
  log_id       uuid        REFERENCES public.role_switch_logs(id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS role_switch_sessions_owner_id_idx   ON public.role_switch_sessions (owner_id);
CREATE INDEX IF NOT EXISTS role_switch_sessions_expires_at_idx ON public.role_switch_sessions (expires_at);

ALTER TABLE public.role_switch_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read own switch sessions"
  ON public.role_switch_sessions FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can insert own switch sessions"
  ON public.role_switch_sessions FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can delete own switch sessions"
  ON public.role_switch_sessions FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());
