-- Tracks trial-related notification events sent to company owners.
-- Prevents duplicate sends (one "expiring_soon" per company per trial,
-- one "expired" per company per trial).

CREATE TABLE IF NOT EXISTS public.trial_notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type         text        NOT NULL CHECK (type IN ('expiring_soon', 'expired')),
  sent_at      timestamptz NOT NULL DEFAULT now(),
  resend_id    text,
  recipient    text,
  error_detail text,
  -- Unique per company per type so re-runs are idempotent
  UNIQUE (company_id, type)
);

CREATE INDEX IF NOT EXISTS idx_trial_notifications_company_id
  ON public.trial_notifications(company_id);

ALTER TABLE public.trial_notifications ENABLE ROW LEVEL SECURITY;

-- Owners can see their own company's notifications
CREATE POLICY "select_own_trial_notifications" ON public.trial_notifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.company_id = trial_notifications.company_id
        AND u.role = 'owner'
    )
  );
