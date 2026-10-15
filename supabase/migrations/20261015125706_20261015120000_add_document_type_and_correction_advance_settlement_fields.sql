/*
# Add document_type and correction/advance/settlement fields to issued_invoices

## Purpose
Extend the issued_invoices table to support four new KSeF document types:
- CORRECTION (Faktura korygująca)
- ADVANCE (Faktura zaliczkowa)
- SETTLEMENT (Faktura rozliczeniowa)
- SIMPLIFIED (Faktura uproszczona)

## Changes to issued_invoices

### New columns
1. `document_type` (text, NOT NULL, DEFAULT 'STANDARD')
   - Values: STANDARD, CORRECTION, ADVANCE, SETTLEMENT, SIMPLIFIED
   - Added via DO block for idempotency

2. Correction invoice fields:
   - `original_invoice_id` (uuid, nullable) — FK to issued_invoices for correction invoices
   - `correction_reason` (text, nullable) — reason for the correction
   - `corrected_invoice_number` (text, nullable) — original invoice number (denormalized for display)
   - `corrected_invoice_date` (date, nullable) — original invoice issue date

3. Advance invoice fields:
   - `advance_amount` (numeric(14,2), nullable) — the advance payment received
   - `order_total_gross` (numeric(14,2), nullable) — total order value
   - `remaining_amount` (numeric(14,2), nullable) — remaining after this advance

4. Settlement invoice fields:
   - `settlement_of_invoice_id` (uuid, nullable) — FK to the final invoice being settled
   - `total_advances_amount` (numeric(14,2), nullable) — sum of all referenced advances
   - `amount_due` (numeric(14,2), nullable) — amount due after subtracting advances

### New junction table: issued_invoice_advances
- Links settlement invoices to their referenced advance invoices
- Columns: id, settlement_invoice_id, advance_invoice_id, advance_amount, advance_number, created_at

## Security
- RLS already enabled on issued_invoices — new columns inherit existing policies
- RLS enabled on issued_invoice_advances with owner-scoped policies matching issued_invoices pattern
- The original_invoice_id and settlement_of_invoice_id FKs use SET NULL on delete to avoid cascading data loss

## Important notes
1. All column additions use DO $$ ... IF NOT EXISTS ... END $$ for idempotency
2. The document_type DEFAULT ensures existing invoices are automatically 'STANDARD'
3. The junction table allows multiple advance invoices per settlement invoice
*/

-- ─── Add document_type column ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issued_invoices' AND column_name = 'document_type'
  ) THEN
    ALTER TABLE issued_invoices
      ADD COLUMN document_type text NOT NULL DEFAULT 'STANDARD';
  END IF;
END $$;

-- ─── Add correction invoice fields ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issued_invoices' AND column_name = 'original_invoice_id'
  ) THEN
    ALTER TABLE issued_invoices
      ADD COLUMN original_invoice_id uuid REFERENCES issued_invoices(id) ON DELETE SET NULL,
      ADD COLUMN correction_reason text,
      ADD COLUMN corrected_invoice_number text,
      ADD COLUMN corrected_invoice_date date;
  END IF;
END $$;

-- ─── Add advance invoice fields ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issued_invoices' AND column_name = 'advance_amount'
  ) THEN
    ALTER TABLE issued_invoices
      ADD COLUMN advance_amount numeric(14,2),
      ADD COLUMN order_total_gross numeric(14,2),
      ADD COLUMN remaining_amount numeric(14,2);
  END IF;
END $$;

-- ─── Add settlement invoice fields ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issued_invoices' AND column_name = 'settlement_of_invoice_id'
  ) THEN
    ALTER TABLE issued_invoices
      ADD COLUMN settlement_of_invoice_id uuid REFERENCES issued_invoices(id) ON DELETE SET NULL,
      ADD COLUMN total_advances_amount numeric(14,2),
      ADD COLUMN amount_due numeric(14,2);
  END IF;
END $$;

-- ─── Add CHECK constraint for document_type ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issued_invoices_document_type_check'
  ) THEN
    ALTER TABLE issued_invoices
      ADD CONSTRAINT issued_invoices_document_type_check
      CHECK (document_type IN ('STANDARD', 'CORRECTION', 'ADVANCE', 'SETTLEMENT', 'SIMPLIFIED'));
  END IF;
END $$;

-- ─── Add index for document_type queries ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'issued_invoices_document_type_idx'
  ) THEN
    CREATE INDEX issued_invoices_document_type_idx ON issued_invoices(document_type);
  END IF;
END $$;

-- ─── Create junction table: issued_invoice_advances ───────────────────────────
CREATE TABLE IF NOT EXISTS issued_invoice_advances (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_invoice_id   uuid NOT NULL REFERENCES issued_invoices(id) ON DELETE CASCADE,
  advance_invoice_id      uuid NOT NULL REFERENCES issued_invoices(id) ON DELETE RESTRICT,
  advance_amount          numeric(14,2) NOT NULL DEFAULT 0,
  advance_number          text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on the junction table
ALTER TABLE issued_invoice_advances ENABLE ROW LEVEL SECURITY;

-- The junction table inherits ownership via the settlement_invoice_id FK.
-- We scope policies through the parent issued_invoices table ownership check.
-- issued_invoices uses company_id for ownership, so we check that the
-- settlement invoice belongs to the user's company.

DROP POLICY IF EXISTS "select_own_invoice_advances" ON issued_invoice_advances;
CREATE POLICY "select_own_invoice_advances"
ON issued_invoice_advances FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM issued_invoices inv
    WHERE inv.id = issued_invoice_advances.settlement_invoice_id
    AND inv.company_id = (
      SELECT company_id FROM users WHERE users.id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "insert_own_invoice_advances" ON issued_invoice_advances;
CREATE POLICY "insert_own_invoice_advances"
ON issued_invoice_advances FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM issued_invoices inv
    WHERE inv.id = issued_invoice_advances.settlement_invoice_id
    AND inv.company_id = (
      SELECT company_id FROM users WHERE users.id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "delete_own_invoice_advances" ON issued_invoice_advances;
CREATE POLICY "delete_own_invoice_advances"
ON issued_invoice_advances FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM issued_invoices inv
    WHERE inv.id = issued_invoice_advances.settlement_invoice_id
    AND inv.company_id = (
      SELECT company_id FROM users WHERE users.id = auth.uid()
    )
  )
);

-- Grant privileges to authenticated role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_name = 'issued_invoice_advances' AND grantee = 'authenticated' AND privilege_type = 'SELECT'
  ) THEN
    GRANT SELECT, INSERT, DELETE ON issued_invoice_advances TO authenticated;
  END IF;
END $$;
