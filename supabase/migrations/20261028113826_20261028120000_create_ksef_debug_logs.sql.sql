/*
# Create ksef_debug_logs table

1. New Tables
- `ksef_debug_logs`
  - `id` (uuid, PK)
  - `invoice_id` (uuid, FK to platform_invoices)
  - `event_type` (text) — XML_GENERATED, VALIDATION_FAILED, VALIDATION_PASSED,
    SUBMISSION_STARTED, SUBMISSION_ACCEPTED, SUBMISSION_REJECTED, RESPONSE_RECEIVED
  - `status` (text) — passed, failed, started, accepted, rejected, info
  - `message` (text) — human-readable summary
  - `payload` (jsonb) — structured details: missing fields, XML snippet, KSeF response, etc.
  - `created_at` (timestamptz)

2. Security
- Enable RLS on `ksef_debug_logs`.
- Grant SELECT, INSERT to `authenticated` (owner-only app; owner role enforced in API).
- 4 owner-scoped policies keyed on platform_invoices ownership via subquery.
- Grant service_role INSERT for internal retry worker.
*/

CREATE TABLE IF NOT EXISTS ksef_debug_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES platform_invoices(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  status      text NOT NULL DEFAULT 'info',
  message     text,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ksef_debug_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON ksef_debug_logs TO authenticated;
GRANT INSERT ON ksef_debug_logs TO service_role;

CREATE INDEX IF NOT EXISTS idx_ksef_debug_logs_invoice_id ON ksef_debug_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ksef_debug_logs_created_at ON ksef_debug_logs(created_at DESC);

DROP POLICY IF EXISTS "select_own_ksef_debug_logs" ON ksef_debug_logs;
CREATE POLICY "select_own_ksef_debug_logs"
  ON ksef_debug_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_invoices pi
      WHERE pi.id = ksef_debug_logs.invoice_id
      AND pi.issued_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_ksef_debug_logs" ON ksef_debug_logs;
CREATE POLICY "insert_own_ksef_debug_logs"
  ON ksef_debug_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_invoices pi
      WHERE pi.id = ksef_debug_logs.invoice_id
      AND pi.issued_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_own_ksef_debug_logs" ON ksef_debug_logs;
CREATE POLICY "update_own_ksef_debug_logs"
  ON ksef_debug_logs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_invoices pi
      WHERE pi.id = ksef_debug_logs.invoice_id
      AND pi.issued_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_invoices pi
      WHERE pi.id = ksef_debug_logs.invoice_id
      AND pi.issued_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_own_ksef_debug_logs" ON ksef_debug_logs;
CREATE POLICY "delete_own_ksef_debug_logs"
  ON ksef_debug_logs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_invoices pi
      WHERE pi.id = ksef_debug_logs.invoice_id
      AND pi.issued_by = auth.uid()
    )
  );
