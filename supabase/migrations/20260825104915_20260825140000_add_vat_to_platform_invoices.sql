/*
# Add VAT/tax fields to platform invoices + company_tax_config table

## Purpose
Adds configurable VAT handling for platform usage invoices. Owners can select
a VAT rate (preset or custom), choose invoice-level or per-line VAT, toggle
tax-inclusive/exclusive pricing, and store an immutable tax snapshot on issued
invoices. Company-level default VAT configuration is stored in company_tax_config.

## Changes to `platform_invoices`
- vat_rate_percent numeric(5,2) NULL — VAT rate (0-100, 2 decimal precision)
- vat_number text NULL — optional VAT number for this invoice
- price_includes_tax boolean DEFAULT false — whether line prices include tax
- tax_total_cents bigint DEFAULT 0 — total tax amount in cents
- tax_breakdown jsonb NULL — per-line and aggregated tax details
- tax_snapshot_taken_at timestamptz NULL — when the immutable snapshot was set

## Changes to `platform_invoice_line_items`
- vat_rate_percent numeric(5,2) NULL — per-line VAT rate override

## New table: `company_tax_config`
- company_id (FK companies), default_vat_rate, default_vat_number,
  tax_policy ('allow'|'owner_only'|'disabled'), updated_at

## Security
- RLS on company_tax_config: owner-only for all operations.
- Existing platform_invoice_audit table used for tax audit events.
*/

-- ── Add VAT columns to platform_invoices ──────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_invoices' AND column_name = 'vat_rate_percent'
  ) THEN
    ALTER TABLE platform_invoices
      ADD COLUMN vat_rate_percent numeric(5,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_invoices' AND column_name = 'vat_number'
  ) THEN
    ALTER TABLE platform_invoices
      ADD COLUMN vat_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_invoices' AND column_name = 'price_includes_tax'
  ) THEN
    ALTER TABLE platform_invoices
      ADD COLUMN price_includes_tax boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_invoices' AND column_name = 'tax_total_cents'
  ) THEN
    ALTER TABLE platform_invoices
      ADD COLUMN tax_total_cents bigint NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_invoices' AND column_name = 'tax_breakdown'
  ) THEN
    ALTER TABLE platform_invoices
      ADD COLUMN tax_breakdown jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_invoices' AND column_name = 'tax_snapshot_taken_at'
  ) THEN
    ALTER TABLE platform_invoices
      ADD COLUMN tax_snapshot_taken_at timestamptz;
  END IF;
END $$;

-- ── Add per-line VAT rate to platform_invoice_line_items ───────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_invoice_line_items' AND column_name = 'vat_rate_percent'
  ) THEN
    ALTER TABLE platform_invoice_line_items
      ADD COLUMN vat_rate_percent numeric(5,2);
  END IF;
END $$;

-- ── Create company_tax_config table ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_tax_config (
  company_id          uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  default_vat_rate    numeric(5,2),
  default_vat_number  text,
  tax_policy          text NOT NULL DEFAULT 'allow'
    CHECK (tax_policy IN ('allow', 'owner_only', 'disabled')),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_tax_config_company_id
  ON company_tax_config(company_id);

ALTER TABLE company_tax_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_tax_config" ON company_tax_config;
CREATE POLICY "select_company_tax_config"
  ON company_tax_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
    OR company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_company_tax_config" ON company_tax_config;
CREATE POLICY "insert_company_tax_config"
  ON company_tax_config FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "update_company_tax_config" ON company_tax_config;
CREATE POLICY "update_company_tax_config"
  ON company_tax_config FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "delete_company_tax_config" ON company_tax_config;
CREATE POLICY "delete_company_tax_config"
  ON company_tax_config FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'));

GRANT SELECT, INSERT, UPDATE, DELETE ON company_tax_config TO authenticated;
