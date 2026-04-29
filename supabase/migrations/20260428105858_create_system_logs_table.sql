/*
  # Create system_logs table

  ## Purpose
  Stores an audit trail of system events for the admin logs view.

  ## New Tables
  - `system_logs`
    - `id` (uuid, primary key)
    - `event_type` (text) — e.g. 'user_registered', 'company_created', 'invoice_synced', 'risk_flag', 'subscription_activated', 'subscription_cancelled'
    - `level` (text) — 'info' | 'success' | 'warning' | 'error'
    - `message` (text) — short human-readable summary
    - `detail` (text) — longer detail string
    - `company_id` (uuid, nullable) — related company
    - `user_id` (uuid, nullable) — related user
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled; only admins (role = 'admin' in users table) can SELECT
  - INSERT is restricted to service_role (triggers run as definer)

  ## Triggers
  - On INSERT into `users` → log user_registered
  - On INSERT into `companies` → log company_created
  - On INSERT into `company_invoices` → log invoice_synced (batched via a later manual call or per-row)
  - On INSERT/UPDATE of `companies.subscription_status` → log subscription events
  - On INSERT into `risk_flags` with severity='high' → log risk_flag warning
*/

-- Main logs table
CREATE TABLE IF NOT EXISTS system_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   text NOT NULL DEFAULT '',
  level        text NOT NULL DEFAULT 'info' CHECK (level IN ('info','success','warning','error')),
  message      text NOT NULL DEFAULT '',
  detail       text NOT NULL DEFAULT '',
  company_id   uuid REFERENCES companies(id) ON DELETE SET NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_logs_created_at_idx ON system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS system_logs_level_idx ON system_logs(level);

ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read logs
CREATE POLICY "Admins can read system logs"
  ON system_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Service role can insert (used by triggers via SECURITY DEFINER)
CREATE POLICY "Service role can insert system logs"
  ON system_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ─── Trigger helper ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_system_event(
  p_event_type text,
  p_level      text,
  p_message    text,
  p_detail     text,
  p_company_id uuid DEFAULT NULL,
  p_user_id    uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO system_logs(event_type, level, message, detail, company_id, user_id)
  VALUES (p_event_type, p_level, p_message, p_detail, p_company_id, p_user_id);
END;
$$;

-- ─── Trigger: new user registered ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_log_user_registered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM log_system_event(
    'user_registered',
    'info',
    'Nowy użytkownik zarejestrowany',
    COALESCE(NEW.email, 'nieznany e-mail') || ' (ID: ' || NEW.id || ')',
    NEW.company_id,
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_registered ON users;
CREATE TRIGGER trg_users_registered
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION trg_log_user_registered();

-- ─── Trigger: new company created ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_log_company_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM log_system_event(
    'company_created',
    'info',
    'Nowa firma skonfigurowana',
    COALESCE(NEW.name, 'brak nazwy') || ' — NIP: ' || COALESCE(NEW.nip, '—'),
    NEW.id,
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_created ON companies;
CREATE TRIGGER trg_companies_created
  AFTER INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION trg_log_company_created();

-- ─── Trigger: subscription status change ─────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_log_subscription_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level   text;
  v_message text;
BEGIN
  IF NEW.subscription_status = OLD.subscription_status THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_status = 'active' THEN
    v_level   := 'success';
    v_message := 'Subskrypcja aktywowana';
  ELSIF NEW.subscription_status IN ('cancelled', 'canceled') THEN
    v_level   := 'error';
    v_message := 'Subskrypcja anulowana';
  ELSIF NEW.subscription_status = 'past_due' THEN
    v_level   := 'warning';
    v_message := 'Subskrypcja przeterminowana';
  ELSE
    v_level   := 'info';
    v_message := 'Status subskrypcji zmieniony na: ' || NEW.subscription_status;
  END IF;

  PERFORM log_system_event(
    'subscription_change',
    v_level,
    v_message,
    COALESCE(NEW.name, 'nieznana firma') || ' — ' || COALESCE(NEW.subscription_status, '—'),
    NEW.id,
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_subscription ON companies;
CREATE TRIGGER trg_companies_subscription
  AFTER UPDATE OF subscription_status ON companies
  FOR EACH ROW EXECUTE FUNCTION trg_log_subscription_change();

-- ─── Trigger: high-risk flag detected ────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_log_risk_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_inv_number text;
BEGIN
  IF NEW.severity != 'high' THEN
    RETURN NEW;
  END IF;

  SELECT ci.company_id, ci.invoice_number
    INTO v_company_id, v_inv_number
    FROM company_invoices ci
   WHERE ci.id = NEW.invoice_id;

  PERFORM log_system_event(
    'risk_flag',
    'warning',
    'Faktura wysokiego ryzyka wykryta',
    'Faktura #' || COALESCE(v_inv_number, '—') || ' — ' || COALESCE(NEW.message, NEW.type),
    v_company_id,
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_risk_flags_high ON risk_flags;
CREATE TRIGGER trg_risk_flags_high
  AFTER INSERT ON risk_flags
  FOR EACH ROW EXECUTE FUNCTION trg_log_risk_flag();

-- ─── Trigger: ksef sync completed (ksef_last_synced_at updated) ──────────────

CREATE OR REPLACE FUNCTION trg_log_ksef_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ksef_last_synced_at IS NOT DISTINCT FROM OLD.ksef_last_synced_at THEN
    RETURN NEW;
  END IF;
  IF NEW.ksef_last_synced_at IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM log_system_event(
    'ksef_sync',
    'info',
    'Synchronizacja KSeF ukończona',
    COALESCE(NEW.name, 'nieznana firma'),
    NEW.id,
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_ksef_sync ON companies;
CREATE TRIGGER trg_companies_ksef_sync
  AFTER UPDATE OF ksef_last_synced_at ON companies
  FOR EACH ROW EXECUTE FUNCTION trg_log_ksef_sync();
