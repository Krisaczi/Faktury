/*
# Create invoice_risk_findings

1. New Table
- `invoice_risk_findings` stores each rule-based risk result for an invoice.
- Columns: id, invoice_id, company_id, rule_code, rule_name, severity
  (low / medium / high / critical), score (0-100), message, details (json with
  the evidence that triggered the rule), created_at.

2. Security
- Row level security is enabled.
- Company members can read, add and remove findings only for invoices that
  belong to their own company. Findings cannot be edited.
- Inserts must reference an invoice of the same company.

3. Notes
- The risk engine replaces an invoice's findings each time it runs, so the
  table always reflects the latest analysis of that invoice.
*/

CREATE TABLE IF NOT EXISTS invoice_risk_findings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rule_code   text NOT NULL,
  rule_name   text NOT NULL,
  severity    text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  score       integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  message     text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_risk_findings_invoice_id_idx
  ON invoice_risk_findings (invoice_id);

ALTER TABLE invoice_risk_findings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON invoice_risk_findings TO authenticated;

DROP POLICY IF EXISTS "select_company_invoice_risk_findings" ON invoice_risk_findings;
CREATE POLICY "select_company_invoice_risk_findings" ON invoice_risk_findings
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

DROP POLICY IF EXISTS "insert_company_invoice_risk_findings" ON invoice_risk_findings;
CREATE POLICY "insert_company_invoice_risk_findings" ON invoice_risk_findings
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_risk_findings.invoice_id
        AND invoices.company_id = get_user_company_id()
    )
  );

DROP POLICY IF EXISTS "delete_company_invoice_risk_findings" ON invoice_risk_findings;
CREATE POLICY "delete_company_invoice_risk_findings" ON invoice_risk_findings
  FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());
