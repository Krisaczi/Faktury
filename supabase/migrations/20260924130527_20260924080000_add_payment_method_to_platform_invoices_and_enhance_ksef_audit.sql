/*
# Add payment_method to platform_invoices and enhance ksef_submission_audit

## Purpose
Fix critical KSeF submission bug where payment method and due date were not
correctly persisted or sent to KSeF. Platform invoices had no payment_method
column, so the value was always hardcoded to 'transfer' in the XML payload.
The ksef_submission_audit table also lacked fields to record what was actually
sent in the XML, making diagnosis impossible.

## Changes

### 1. platform_invoices: add payment_method column
- New column: `payment_method` text, defaults to 'transfer'
- Allowed values: 'cash', 'transfer', 'card', 'blik', 'other'
- CHECK constraint enforces valid values

### 2. ksef_submission_audit: add diagnostic columns
- `ksef_number` text (nullable) — KSeF reference number returned
- `payment_method_sent` text (nullable) — payment method value sent in XML
- `due_date_sent` text (nullable) — due date value sent in XML
- `xml_payload` text (nullable) — the raw XML payload sent to KSeF
- Index on ksef_number for lookup by KSeF reference

### 3. RLS
- No policy changes — existing owner-only SELECT and authenticated INSERT remain
*/

-- 1. Add payment_method to platform_invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_invoices' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE platform_invoices ADD COLUMN payment_method text NOT NULL DEFAULT 'transfer';
  END IF;
END $$;

ALTER TABLE platform_invoices DROP CONSTRAINT IF EXISTS platform_invoices_payment_method_check;
ALTER TABLE platform_invoices ADD CONSTRAINT platform_invoices_payment_method_check
  CHECK (payment_method IN ('cash', 'transfer', 'card', 'blik', 'other'));

-- 2. Enhance ksef_submission_audit with diagnostic columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ksef_submission_audit' AND column_name = 'ksef_number'
  ) THEN
    ALTER TABLE ksef_submission_audit ADD COLUMN ksef_number text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ksef_submission_audit' AND column_name = 'payment_method_sent'
  ) THEN
    ALTER TABLE ksef_submission_audit ADD COLUMN payment_method_sent text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ksef_submission_audit' AND column_name = 'due_date_sent'
  ) THEN
    ALTER TABLE ksef_submission_audit ADD COLUMN due_date_sent text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ksef_submission_audit' AND column_name = 'xml_payload'
  ) THEN
    ALTER TABLE ksef_submission_audit ADD COLUMN xml_payload text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ksef_submission_audit_ksef_number_idx
  ON public.ksef_submission_audit (ksef_number);