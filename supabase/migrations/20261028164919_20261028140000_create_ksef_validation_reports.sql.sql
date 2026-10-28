/*
# Create ksef_validation_reports table

1. New Tables
- `ksef_validation_reports`
  - `id` (uuid, primary key)
  - `invoice_id` (uuid, references issued_invoices, cascade delete)
  - `overall_status` (text: 'ready' | 'blocked' | 'warning')
  - `ready_for_ksef` (boolean)
  - `math_consistent` (boolean)
  - `computed_p13_9` (numeric)
  - `computed_p15` (numeric)
  - `invoice_net_total` (numeric)
  - `invoice_gross_total` (numeric)
  - `detected_vat_categories` (text[])
  - `emitted_p13_fields` (text[])
  - `emitted_p14_fields` (text[])
  - `xml_validation_result` (jsonb — full XmlValidationResult)
  - `validation_sections` (jsonb — structured report sections)
  - `generated_xml` (text — the FA(3) XML that was validated)
  - `error_count` (integer, default 0)
  - `warning_count` (integer, default 0)
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `ksef_validation_reports`.
- Grant SELECT to `authenticated` so the owner/admin can view reports.
- Grant INSERT to `authenticated` so server-side code can create reports.
- No UPDATE or DELETE via Data API (reports are immutable audit records).
- Owner-scoped: users can only see reports for invoices owned by their company.
*/

CREATE TABLE IF NOT EXISTS ksef_validation_reports (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id              uuid NOT NULL REFERENCES issued_invoices(id) ON DELETE CASCADE,
  overall_status          text NOT NULL DEFAULT 'blocked',
  ready_for_ksef          boolean NOT NULL DEFAULT false,
  math_consistent         boolean NOT NULL DEFAULT false,
  computed_p13_9          numeric(14, 2) NOT NULL DEFAULT 0,
  computed_p15            numeric(14, 2) NOT NULL DEFAULT 0,
  invoice_net_total       numeric(14, 2) NOT NULL DEFAULT 0,
  invoice_gross_total     numeric(14, 2) NOT NULL DEFAULT 0,
  detected_vat_categories text[] NOT NULL DEFAULT '{}',
  emitted_p13_fields      text[] NOT NULL DEFAULT '{}',
  emitted_p14_fields      text[] NOT NULL DEFAULT '{}',
  xml_validation_result   jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_sections     jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_xml           text,
  error_count             integer NOT NULL DEFAULT 0,
  warning_count           integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ksef_validation_reports ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON ksef_validation_reports TO authenticated;

-- Users can view validation reports for invoices in their company
DROP POLICY IF EXISTS "select_own_validation_reports" ON ksef_validation_reports;
CREATE POLICY "select_own_validation_reports"
ON ksef_validation_reports FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM issued_invoices
    WHERE issued_invoices.id = ksef_validation_reports.invoice_id
    AND issued_invoices.company_id = (
      SELECT company_id FROM users WHERE users.id = auth.uid()
    )
  )
);

-- Users can create validation reports for invoices in their company
DROP POLICY IF EXISTS "insert_own_validation_reports" ON ksef_validation_reports;
CREATE POLICY "insert_own_validation_reports"
ON ksef_validation_reports FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM issued_invoices
    WHERE issued_invoices.id = ksef_validation_reports.invoice_id
    AND issued_invoices.company_id = (
      SELECT company_id FROM users WHERE users.id = auth.uid()
    )
  )
);

-- Index for quick lookup by invoice
CREATE INDEX IF NOT EXISTS idx_ksef_validation_reports_invoice_id
ON ksef_validation_reports(invoice_id);

-- Index for sorting by creation time
CREATE INDEX IF NOT EXISTS idx_ksef_validation_reports_created_at
ON ksef_validation_reports(created_at DESC);
