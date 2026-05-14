/*
  # Invoice Detail Enhancements

  ## Summary
  Adds database infrastructure to support the full invoice detail spec:
  - Audit log retrieval RPC for admins/owners to view per-invoice action history
  - Escalated flag status for the flag workflow
  - Index improvements for audit log lookups

  ## Modified Tables

  ### risk_flags
  - Extends the status CHECK constraint to include 'escalated'
  - Adds `comment` text column for flag comments/notes

  ## New RPCs

  ### get_invoice_audit_log(p_invoice_id uuid)
  - Returns chronological audit log entries for a specific invoice
  - SECURITY DEFINER, restricted to admin/owner roles via RLS
  - Returns: id, action, metadata, user display info, created_at

  ## Security
  - Audit log reads still restricted to admin/owner roles only
  - New RPC enforces company scoping and role check internally
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend risk_flags.status to include 'escalated'
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Drop the old check constraint if it exists, replace with extended one
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'risk_flags' AND constraint_name = 'risk_flags_status_check'
  ) THEN
    ALTER TABLE risk_flags DROP CONSTRAINT risk_flags_status_check;
  END IF;

  ALTER TABLE risk_flags
    ADD CONSTRAINT risk_flags_status_check
    CHECK (status IN ('open', 'acknowledged', 'dismissed', 'escalated'));
END $$;

-- Add comment column to risk_flags for flag notes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'risk_flags' AND column_name = 'comment'
  ) THEN
    ALTER TABLE risk_flags ADD COLUMN comment text;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS audit_logs_invoice_action_idx
  ON audit_logs(invoice_id, action, created_at DESC)
  WHERE invoice_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_invoice_audit_log RPC
-- Returns paginated audit entries for a specific invoice, admin/owner only
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_invoice_audit_log(
  p_invoice_id uuid,
  p_limit      int DEFAULT 50
)
RETURNS TABLE (
  id         uuid,
  action     text,
  metadata   jsonb,
  user_id    uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_role       text;
BEGIN
  v_company_id := get_user_company_id();
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  -- Restrict to admin/owner
  SELECT u.role INTO v_role
  FROM users u WHERE u.id = auth.uid();

  IF v_role NOT IN ('owner', 'admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    al.id,
    al.action,
    al.metadata,
    al.user_id,
    al.created_at
  FROM audit_logs al
  WHERE al.invoice_id  = p_invoice_id
    AND al.company_id  = v_company_id
  ORDER BY al.created_at DESC
  LIMIT LEAST(p_limit, 200);
END;
$$;
