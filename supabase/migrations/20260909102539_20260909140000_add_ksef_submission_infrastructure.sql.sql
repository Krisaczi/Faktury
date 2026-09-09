/*
# Add KSeF submission tracking to platform_invoices + ksef_submission_jobs table

## Purpose
Track KSeF submission status for platform-issued invoices (owner billing invoices).
This enables automatic KSeF submission when an invoice is issued, with retry,
audit trail, and duplicate prevention.

## Changes
1. Modified Table: `platform_invoices`
   - `ksef_number` (text, nullable) — the KSeF reference number returned by KSeF
   - `ksef_submission_id` (text, nullable) — KSeF's submission/session ID
   - `ksef_status` (text, nullable) — enum: pending, queued, submitted, accepted, rejected, failed
   - `ksef_response` (jsonb, nullable) — full KSeF API response (error details, etc.)
   - `ksef_submitted_at` (timestamptz, nullable) — first successful submission timestamp
   - `ksef_last_attempt_at` (timestamptz, nullable) — last submission attempt timestamp

2. New Table: `ksef_submission_jobs`
   - Tracks individual submission attempts with retry metadata
   - `id` uuid PK
   - `invoice_id` uuid → platform_invoices(id) CASCADE
   - `invoice_type` text (default 'platform') — distinguishes platform vs user invoices
   - `attempt_count` int default 0
   - `max_attempts` int default 5
   - `status` text — pending, queued, submitted, accepted, rejected, failed
   - `last_error` text, nullable
   - `idempotency_key` text — deterministic key for idempotent submissions
   - `created_at`, `updated_at` timestamps

3. New Index
   - `platform_invoices_ksef_number_idx` — UNIQUE on `ksef_number` WHERE NOT NULL
   - `ksef_submission_jobs_invoice_id_idx` — on `invoice_id`
   - `ksef_submission_jobs_status_idx` — on `status`

## Security
- RLS enabled on `ksef_submission_jobs` with owner-only access (matching platform_invoices).
- No changes to existing platform_invoices RLS policies — new columns inherit existing policies.

## Notes
- The unique partial index on ksef_number prevents duplicate KSeF numbers.
- The idempotency_key in submission jobs enables dedup across retry attempts.
- invoice_type column future-proofs the jobs table for user-issued invoices.
*/

-- 1. Add KSeF columns to platform_invoices
ALTER TABLE public.platform_invoices
  ADD COLUMN IF NOT EXISTS ksef_number text,
  ADD COLUMN IF NOT EXISTS ksef_submission_id text,
  ADD COLUMN IF NOT EXISTS ksef_status text,
  ADD COLUMN IF NOT EXISTS ksef_response jsonb,
  ADD COLUMN IF NOT EXISTS ksef_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS ksef_last_attempt_at timestamptz;

-- 2. Unique index on ksef_number (partial — only where NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS platform_invoices_ksef_number_idx
  ON public.platform_invoices (ksef_number)
  WHERE ksef_number IS NOT NULL;

-- 3. Create ksef_submission_jobs table
CREATE TABLE IF NOT EXISTS public.ksef_submission_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.platform_invoices(id) ON DELETE CASCADE,
  invoice_type text NOT NULL DEFAULT 'platform',
  attempt_count int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ksef_submission_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_select_ksef_submission_jobs" ON public.ksef_submission_jobs;
CREATE POLICY "owner_select_ksef_submission_jobs"
  ON public.ksef_submission_jobs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'owner'));

DROP POLICY IF EXISTS "owner_insert_ksef_submission_jobs" ON public.ksef_submission_jobs;
CREATE POLICY "owner_insert_ksef_submission_jobs"
  ON public.ksef_submission_jobs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'owner'));

DROP POLICY IF EXISTS "owner_update_ksef_submission_jobs" ON public.ksef_submission_jobs;
CREATE POLICY "owner_update_ksef_submission_jobs"
  ON public.ksef_submission_jobs FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'owner'));

DROP POLICY IF EXISTS "owner_delete_ksef_submission_jobs" ON public.ksef_submission_jobs;
CREATE POLICY "owner_delete_ksef_submission_jobs"
  ON public.ksef_submission_jobs FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'owner'));

-- 4. Indexes
CREATE INDEX IF NOT EXISTS ksef_submission_jobs_invoice_id_idx
  ON public.ksef_submission_jobs (invoice_id);

CREATE INDEX IF NOT EXISTS ksef_submission_jobs_status_idx
  ON public.ksef_submission_jobs (status);

-- 5. Grant privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ksef_submission_jobs TO authenticated;
