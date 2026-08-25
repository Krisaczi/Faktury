/*
# Add billing address snapshot to issued_invoices + invoice_audit table

## Purpose
Invoice creation must always populate the billing (seller) address from the
company Settings field "Adres firmy". This migration adds immutable address
snapshot columns to `issued_invoices` so that later edits to the company
address do not retroactively change issued invoices. It also creates an
`invoice_audit` table for address-related audit events.

## Changes to `issued_invoices` table
1. `billing_address_snapshot` (jsonb, nullable) — frozen copy of the company
   address at the moment the invoice draft was created or last refreshed.
   Must be set before an invoice can be issued (enforced in application logic).
2. `billing_address_source` (text, nullable) — 'company_settings' or 'override'.
   Indicates whether the address came from Settings or an owner override.
3. `billing_address_last_synced_at` (timestamptz, nullable) — when the snapshot
   was last taken from the company address.

## New table: `invoice_audit`
- Stores address-related audit events for invoices.
- Columns: id, invoice_id, company_id, actor_id, actor_role, event, source,
  before (jsonb), after (jsonb), reason, ip, created_at.
- Events: address_snapshot_created, address_snapshot_refreshed,
  address_override_used, address_missing_blocked_issue.

## Security
- RLS enabled on `invoice_audit`.
- Company-scoped policies: members can SELECT, any company member can INSERT.
- Owner (platform owner) can read all via existing cross-company policies.
*/

-- ── Add columns to issued_invoices ────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issued_invoices' AND column_name = 'billing_address_snapshot'
  ) THEN
    ALTER TABLE issued_invoices
      ADD COLUMN billing_address_snapshot jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issued_invoices' AND column_name = 'billing_address_source'
  ) THEN
    ALTER TABLE issued_invoices
      ADD COLUMN billing_address_source text
      CHECK (billing_address_source IN ('company_settings', 'override'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issued_invoices' AND column_name = 'billing_address_last_synced_at'
  ) THEN
    ALTER TABLE issued_invoices
      ADD COLUMN billing_address_last_synced_at timestamptz;
  END IF;
END $$;

-- ── Backfill existing issued invoices from companies address ──────────────
-- Only backfill rows that have a seller_address but no snapshot yet.

UPDATE issued_invoices
SET
  billing_address_snapshot = COALESCE(
    billing_address_snapshot,
    jsonb_build_object(
      'addressLine1', COALESCE(c.street, ''),
      'addressLine2', COALESCE(c.address_line2, ''),
      'city',         COALESCE(c.city, ''),
      'postalCode',   COALESCE(c.zip, ''),
      'stateRegion',  COALESCE(c.state_region, ''),
      'country',      COALESCE(c.country, 'PL'),
      'vatId',        COALESCE(c.nip, '')
    )
  ),
  billing_address_source = COALESCE(billing_address_source, 'company_settings'),
  billing_address_last_synced_at = COALESCE(
    billing_address_last_synced_at,
    issued_invoices.updated_at
  )
FROM companies c
WHERE issued_invoices.company_id = c.id
  AND issued_invoices.billing_address_snapshot IS NULL;

-- ── Create invoice_audit table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES issued_invoices(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role  text NOT NULL DEFAULT 'accountant',
  event       text NOT NULL,
  source      text,
  before      jsonb,
  after       jsonb,
  reason      text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_audit_invoice_id
  ON invoice_audit(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_audit_company_id
  ON invoice_audit(company_id);

ALTER TABLE invoice_audit ENABLE ROW LEVEL SECURITY;

-- Company members can view their own invoice audit entries
DROP POLICY IF EXISTS "select_own_invoice_audit" ON invoice_audit;
CREATE POLICY "select_own_invoice_audit"
  ON invoice_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.company_id = invoice_audit.company_id
    )
  );

-- Company members can insert audit entries for their own invoices
DROP POLICY IF EXISTS "insert_own_invoice_audit" ON invoice_audit;
CREATE POLICY "insert_own_invoice_audit"
  ON invoice_audit FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.company_id = invoice_audit.company_id
    )
  );

-- Platform owner can read all invoice audit entries
DROP POLICY IF EXISTS "owner_read_all_invoice_audit" ON invoice_audit;
CREATE POLICY "owner_read_all_invoice_audit"
  ON invoice_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'owner'
    )
  );

-- Grant privileges
GRANT SELECT, INSERT ON invoice_audit TO authenticated;
