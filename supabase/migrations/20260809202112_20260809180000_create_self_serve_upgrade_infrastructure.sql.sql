/*
 * Self-serve upgrade infrastructure.
 *
 * Creates:
 *   - billing_audit table (upgrade audit log with provider transaction id)
 *   - webhook_events table (idempotency for Lemon Squeezy webhook delivery)
 *   - webhook_audit table (trace log for all webhook deliveries)
 *   - companies.package_changed_at timestamp
 *
 * RLS:
 *   - billing_audit: users can SELECT their own company's audit rows;
 *     only service_role can INSERT (webhook handler)
 *   - webhook_events: service_role only (not exposed to clients)
 *   - webhook_audit: service_role only
 */

-- ════════════════════════════════════════════════════════════════════════════
-- 1. companies.package_changed_at
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS package_changed_at timestamptz DEFAULT now();

-- ════════════════════════════════════════════════════════════════════════════
-- 2. billing_audit — upgrade audit log
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.billing_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id        uuid NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  old_package     text NOT NULL DEFAULT 'starter',
  new_package     text NOT NULL,
  provider        text NOT NULL DEFAULT 'lemonsqueezy',
  provider_tx_id  text,
  amount_cents    integer,
  currency        text DEFAULT 'PLN',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_audit_company ON public.billing_audit(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_audit_tx     ON public.billing_audit(provider_tx_id);

ALTER TABLE public.billing_audit ENABLE ROW LEVEL SECURITY;

-- Users can view their own company's billing audit history
CREATE POLICY "select_own_billing_audit"
ON public.billing_audit FOR SELECT TO authenticated
USING (company_id = get_user_company_id());

-- Only service_role can insert (webhook handler uses service client)
CREATE POLICY "insert_billing_audit_service"
ON public.billing_audit FOR INSERT TO authenticated
WITH CHECK (false);

-- No updates or deletes via client
-- (no UPDATE/DELETE policies = denied by default)

-- ════════════════════════════════════════════════════════════════════════════
-- 3. webhook_events — idempotency for webhook delivery
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_id    text PRIMARY KEY,
  event_type  text,
  company_id  uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies = only service_role can access (RLS blocks authenticated/anon)

-- ════════════════════════════════════════════════════════════════════════════
-- 4. webhook_audit — trace log for all webhook deliveries
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.webhook_audit (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         text,
  company_id       uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  event_type       text,
  status           text NOT NULL,
  payload_snapshot jsonb,
  error_detail     text,
  duration_ms      integer,
  processed_by     text DEFAULT 'webhook',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_audit_event ON public.webhook_audit(event_id);

ALTER TABLE public.webhook_audit ENABLE ROW LEVEL SECURITY;
-- No policies = only service_role can access

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Grant service_role full access to webhook tables
-- ════════════════════════════════════════════════════════════════════════════

GRANT ALL ON public.billing_audit   TO authenticated, anon;
GRANT ALL ON public.webhook_events  TO authenticated, anon;
GRANT ALL ON public.webhook_audit   TO authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. billing_metadata table (for Lemon Squeezy subscription state)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.billing_metadata (
  company_id        uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  ls_subscription_id text,
  ls_customer_id    text,
  ls_product_id     text,
  ls_variant_id     text,
  plan_name         text,
  status            text DEFAULT 'active',
  renews_at         timestamptz,
  ends_at           timestamptz,
  cancelled_at      timestamptz,
  raw_payload       jsonb,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_billing_metadata"
ON public.billing_metadata FOR SELECT TO authenticated
USING (company_id = get_user_company_id());

-- Only service_role can insert/update (webhook handler)
CREATE POLICY "insert_billing_metadata_service"
ON public.billing_metadata FOR INSERT TO authenticated
WITH CHECK (false);

CREATE POLICY "update_billing_metadata_service"
ON public.billing_metadata FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

GRANT ALL ON public.billing_metadata TO authenticated, anon;