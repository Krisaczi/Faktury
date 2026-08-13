/*
# Create email_events table — incoming email ingestion logging & diagnostics

## Purpose
When invoices are emailed to addresses like mleko@invoiceguard.app, the mail
provider (Mailgun / Resend / SES) forwards each message to the /api/email-ingest
webhook. Before this migration, accepted emails were logged only to audit_logs
and rejected emails (e.g. "Invalid recipient address") were not logged at all.

This migration creates a dedicated `email_events` table that captures **every**
incoming email attempt — accepted, rejected, or errored — so that the admin
panel can display the last 20 events and operators can diagnose delivery
failures like the "555: 5.7.1 Invalid recipient address" error.

## New Table: email_events
- `id`             uuid PK
- `event_type`     text — 'received' | 'rejected' | 'processed' | 'error'
- `sender`         text — sender email address
- `recipient`      text — recipient email address (the ingestion address)
- `subject`        text — email subject line
- `provider`       text — mail provider that delivered the webhook ('mailgun' | 'resend' | 'ses' | 'unknown')
- `status_code`    integer — HTTP status returned to the provider
- `company_id`     uuid — matched company (nullable if no match found)
- `upload_session_id` uuid — associated upload session (nullable)
- `attachments_count` integer — number of attachments found
- `files_processed`   integer — number of files successfully stored
- `error_message`  text — error details if rejected/errored
- `raw_metadata`   jsonb — additional provider-specific metadata
- `created_at`     timestamptz — event timestamp

## Security
- RLS enabled on email_events.
- Only authenticated users with role 'owner' can read (SELECT) events.
- INSERT is allowed for the service role (used by the /api/email-ingest route
  which runs with the service role key — bypasses RLS).
- No UPDATE or DELETE from the frontend; events are append-only.

## Important Notes
1. The email-ingest backend route uses the SUPABASE_SERVICE_ROLE_KEY which
   bypasses RLS, so INSERT policies are not strictly needed for that path.
   The INSERT policy for `authenticated` is included for completeness but
   the real insert path uses the service role client.
2. An index on created_at (descending) supports the "last 20 events" query.
3. An index on recipient supports lookups by ingestion address.
*/

CREATE TABLE IF NOT EXISTS email_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        text NOT NULL DEFAULT 'received',
  sender            text,
  recipient         text,
  subject           text,
  provider          text DEFAULT 'unknown',
  status_code       integer,
  company_id        uuid REFERENCES companies(id) ON DELETE SET NULL,
  upload_session_id uuid,
  attachments_count integer DEFAULT 0,
  files_processed   integer DEFAULT 0,
  error_message     text,
  raw_metadata      jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

-- Owner-only SELECT (frontend admin panel reads through authenticated client)
DROP POLICY IF EXISTS "select_email_events_owner" ON email_events;
CREATE POLICY "select_email_events_owner"
  ON email_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'owner'
    )
  );

-- INSERT via authenticated (the service role bypasses RLS anyway)
DROP POLICY IF EXISTS "insert_email_events_authenticated" ON email_events;
CREATE POLICY "insert_email_events_authenticated"
  ON email_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- No UPDATE or DELETE policies — events are append-only

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS email_events_created_at_idx
  ON email_events (created_at DESC);

CREATE INDEX IF NOT EXISTS email_events_recipient_idx
  ON email_events (recipient);

CREATE INDEX IF NOT EXISTS email_events_event_type_idx
  ON email_events (event_type);

-- Grant privileges
GRANT SELECT ON email_events TO authenticated;
GRANT INSERT ON email_events TO authenticated;
