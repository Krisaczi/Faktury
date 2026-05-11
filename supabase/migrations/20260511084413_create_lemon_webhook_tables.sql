/*
  # Lemon Squeezy Webhook Infrastructure

  ## Purpose
  Provides idempotency tracking and audit logging for inbound Lemon Squeezy
  subscription webhooks processed by /api/lemon-webhook.

  ## New Tables

  ### webhook_events
  - Deduplication table keyed by the Lemon Squeezy event_id (UUID from X-Event-Id header)
  - Each row records: event_id, event_type, company_id, processed_at
  - UNIQUE constraint on event_id ensures exactly-once processing via INSERT ... ON CONFLICT DO NOTHING
  - Service-role only writes; no client access

  ### webhook_audit
  - Append-only audit log for every processed webhook event
  - Stores: event_id, company_id, event_type, payload snapshot, processing status, duration_ms
  - RLS: owners/admins can view their company's audit rows; service role writes

  ## Modified Tables

  ### billing_metadata
  - Adds `trial_ends_at` column for trial expiry tracking
  - Adds `cancelled_at` column for cancellation timestamp
  - Adds `ls_subscription_id` unique index for webhook company resolution

  ## Security
  - Both tables have RLS enabled
  - webhook_events: no SELECT policy (internal use only via service role)
  - webhook_audit: SELECT for owners/admins only; writes via service role
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- webhook_events  (idempotency)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     text        NOT NULL UNIQUE,   -- Lemon Squeezy event UUID
  event_type   text        NOT NULL,
  company_id   uuid        REFERENCES companies(id) ON DELETE SET NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_events_event_id_idx ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS webhook_events_company_idx  ON webhook_events(company_id, processed_at DESC);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
-- No SELECT policy — service role reads only

-- ─────────────────────────────────────────────────────────────────────────────
-- webhook_audit
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_audit (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         text        NOT NULL,
  company_id       uuid        REFERENCES companies(id) ON DELETE SET NULL,
  event_type       text        NOT NULL,
  status           text        NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok', 'failed', 'duplicate', 'unresolved_company')),
  payload_snapshot jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error_detail     text,
  duration_ms      int,
  processed_by     text        NOT NULL DEFAULT 'webhook',
  processed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_audit_company_idx ON webhook_audit(company_id, processed_at DESC);
CREATE INDEX IF NOT EXISTS webhook_audit_event_id_idx ON webhook_audit(event_id);

ALTER TABLE webhook_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins can view webhook audit"
  ON webhook_audit FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- billing_metadata extensions
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_metadata' AND column_name = 'trial_ends_at'
  ) THEN
    ALTER TABLE billing_metadata ADD COLUMN trial_ends_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_metadata' AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE billing_metadata ADD COLUMN cancelled_at timestamptz;
  END IF;
END $$;

-- Unique index on ls_subscription_id for O(1) company resolution from webhook
CREATE UNIQUE INDEX IF NOT EXISTS billing_metadata_ls_subscription_id_idx
  ON billing_metadata(ls_subscription_id)
  WHERE ls_subscription_id IS NOT NULL;
