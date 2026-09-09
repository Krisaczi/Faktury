/*
# Create ksef_submission_audit table for KSeF submission audit trail

## Purpose
Track every KSeF invoice submission attempt with actor, invoice, request/response payloads,
error details, IP, and correlation ID. Distinct from the existing ksef_audit table
(which tracks KSeF credential/token changes).

## Changes
1. New Table: `ksef_submission_audit`
   - id uuid PK
   - invoice_id uuid (no FK to avoid cross-table dependency issues)
   - invoice_type text (default 'platform')
   - actor_id uuid (nullable — null for webhook/system events)
   - attempt_result text — 'submitted', 'accepted', 'rejected', 'queued', 'failed'
   - request_payload jsonb (nullable)
   - response_payload jsonb (nullable)
   - error_message text (nullable)
   - ip text (nullable)
   - correlation_id text (nullable)
   - created_at timestamptz DEFAULT now()

2. Indexes on invoice_id and created_at

3. RLS: owner-only SELECT, authenticated INSERT
*/

CREATE TABLE IF NOT EXISTS public.ksef_submission_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid,
  invoice_type text NOT NULL DEFAULT 'platform',
  actor_id uuid,
  attempt_result text NOT NULL,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  ip text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ksef_submission_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_select_ksef_submission_audit" ON public.ksef_submission_audit;
CREATE POLICY "owner_select_ksef_submission_audit"
  ON public.ksef_submission_audit FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'owner'));

DROP POLICY IF EXISTS "auth_insert_ksef_submission_audit" ON public.ksef_submission_audit;
CREATE POLICY "auth_insert_ksef_submission_audit"
  ON public.ksef_submission_audit FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS ksef_submission_audit_invoice_id_idx ON public.ksef_submission_audit (invoice_id);
CREATE INDEX IF NOT EXISTS ksef_submission_audit_created_at_idx ON public.ksef_submission_audit (created_at);

GRANT SELECT, INSERT ON public.ksef_submission_audit TO authenticated;
