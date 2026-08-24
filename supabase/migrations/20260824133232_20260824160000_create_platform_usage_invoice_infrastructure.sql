/*
# Create platform usage invoice infrastructure

## Purpose
Creates tables for the platform owner to issue monthly platform-usage invoices
to companies. Separate from existing `invoices`/`issued_invoices` tables.
All amounts in cents (integer).

## New Tables
1. `platform_invoice_number_sequences` — per-year atomic counter
2. `platform_invoices` — invoice header with status enum (draft|issued|sent|paid|revoked)
3. `platform_invoice_line_items` — line items per invoice
4. `platform_invoice_audit` — audit trail for every action

## Security
- RLS on all tables. Owner-only for writes. Users can SELECT their own company's invoices.
- RPC `generate_platform_invoice_number(p_year)` atomically generates PI/YYYY/MM/NNN.

## Indexes
- entity_id, status, issued_at, period_start on platform_invoices
- invoice_id on line_items and audit
*/

-- ─── 1. platform_invoice_number_sequences ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_invoice_number_sequences (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year       int NOT NULL,
  counter    int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_inv_seq_year_unique UNIQUE (year)
);

ALTER TABLE platform_invoice_number_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_platform_inv_seq_owner" ON platform_invoice_number_sequences;
CREATE POLICY "select_platform_inv_seq_owner"
  ON platform_invoice_number_sequences FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "update_platform_inv_seq_owner" ON platform_invoice_number_sequences;
CREATE POLICY "update_platform_inv_seq_owner"
  ON platform_invoice_number_sequences FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "insert_platform_inv_seq_owner" ON platform_invoice_number_sequences;
CREATE POLICY "insert_platform_inv_seq_owner"
  ON platform_invoice_number_sequences FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'));

GRANT SELECT, INSERT, UPDATE ON platform_invoice_number_sequences TO authenticated;

-- ─── 2. platform_invoices ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_invoices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number     text UNIQUE,
  entity_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type        text NOT NULL DEFAULT 'company',
  period_start       date NOT NULL,
  period_end         date NOT NULL,
  subtotal_cents     bigint NOT NULL DEFAULT 0,
  tax_cents          bigint NOT NULL DEFAULT 0,
  discount_cents     bigint NOT NULL DEFAULT 0,
  total_cents        bigint NOT NULL DEFAULT 0,
  currency           text NOT NULL DEFAULT 'PLN',
  status             text NOT NULL DEFAULT 'draft',
  issued_by          uuid REFERENCES users(id),
  issued_at          timestamptz,
  due_date           date,
  sent_at            timestamptz,
  notes              text,
  internal_reference text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_invoices_entity_idx    ON platform_invoices (entity_id);
CREATE INDEX IF NOT EXISTS platform_invoices_status_idx    ON platform_invoices (status);
CREATE INDEX IF NOT EXISTS platform_invoices_issued_at_idx ON platform_invoices (issued_at);
CREATE INDEX IF NOT EXISTS platform_invoices_period_idx    ON platform_invoices (period_start);

ALTER TABLE platform_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_platform_invoices" ON platform_invoices;
CREATE POLICY "select_platform_invoices"
  ON platform_invoices FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
    OR entity_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_platform_invoices" ON platform_invoices;
CREATE POLICY "insert_platform_invoices"
  ON platform_invoices FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "update_platform_invoices" ON platform_invoices;
CREATE POLICY "update_platform_invoices"
  ON platform_invoices FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "delete_platform_invoices" ON platform_invoices;
CREATE POLICY "delete_platform_invoices"
  ON platform_invoices FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'));

GRANT SELECT, INSERT, UPDATE, DELETE ON platform_invoices TO authenticated;

-- ─── 3. platform_invoice_line_items ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_invoice_line_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid NOT NULL REFERENCES platform_invoices(id) ON DELETE CASCADE,
  description      text NOT NULL,
  quantity         numeric NOT NULL DEFAULT 1,
  unit_price_cents bigint NOT NULL,
  amount_cents     bigint NOT NULL,
  taxable          boolean NOT NULL DEFAULT true,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_invoice_items_invoice_idx ON platform_invoice_line_items (invoice_id);

ALTER TABLE platform_invoice_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_platform_invoice_items" ON platform_invoice_line_items;
CREATE POLICY "select_platform_invoice_items"
  ON platform_invoice_line_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
    OR invoice_id IN (
      SELECT pi.id FROM platform_invoices pi
      WHERE pi.entity_id IN (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "insert_platform_invoice_items" ON platform_invoice_line_items;
CREATE POLICY "insert_platform_invoice_items"
  ON platform_invoice_line_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "update_platform_invoice_items" ON platform_invoice_line_items;
CREATE POLICY "update_platform_invoice_items"
  ON platform_invoice_line_items FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "delete_platform_invoice_items" ON platform_invoice_line_items;
CREATE POLICY "delete_platform_invoice_items"
  ON platform_invoice_line_items FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'));

GRANT SELECT, INSERT, UPDATE, DELETE ON platform_invoice_line_items TO authenticated;

-- ─── 4. platform_invoice_audit ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_invoice_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES platform_invoices(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES users(id),
  action      text NOT NULL,
  reason      text,
  ip          text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_invoice_audit_invoice_idx ON platform_invoice_audit (invoice_id);
CREATE INDEX IF NOT EXISTS platform_invoice_audit_actor_idx   ON platform_invoice_audit (actor_id);

ALTER TABLE platform_invoice_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_platform_invoice_audit" ON platform_invoice_audit;
CREATE POLICY "select_platform_invoice_audit"
  ON platform_invoice_audit FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "insert_platform_invoice_audit" ON platform_invoice_audit;
CREATE POLICY "insert_platform_invoice_audit"
  ON platform_invoice_audit FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'));

GRANT SELECT, INSERT ON platform_invoice_audit TO authenticated;

-- ─── 5. RPC: generate_platform_invoice_number ───────────────────────────────────
CREATE OR REPLACE FUNCTION generate_platform_invoice_number(p_year int DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year       int := COALESCE(p_year, EXTRACT(year FROM now())::int);
  v_month      int := EXTRACT(month FROM now())::int;
  v_counter    int;
  v_result     text;
BEGIN
  INSERT INTO platform_invoice_number_sequences (year, counter)
  VALUES (v_year, 0)
  ON CONFLICT (year) DO NOTHING;

  UPDATE platform_invoice_number_sequences
  SET counter = counter + 1, updated_at = now()
  WHERE year = v_year
  RETURNING counter INTO v_counter;

  v_result := 'PI/' || v_year::text || '/' || LPAD(v_month::text, 2, '0') || '/' || LPAD(v_counter::text, 3, '0');
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_platform_invoice_number(int) TO authenticated;
