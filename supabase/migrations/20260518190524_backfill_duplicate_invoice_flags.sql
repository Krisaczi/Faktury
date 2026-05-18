/*
  # Back-fill duplicate_invoice_number risk flags

  ## Summary
  Duplicate detection was added after invoices were already imported, so existing
  duplicates have no flags. This migration:

  1. Finds every invoice that shares (company_id, invoice_number, seller_nip) with
     at least one other invoice.
  2. Inserts a 'duplicate_invoice_number' / 'high' risk_flag for each such invoice
     that does not already have one.
  3. Sets overall_risk = 'high' on those invoices (upgrading from null or lower).

  ## Notes
  - Uses INSERT ... ON CONFLICT DO NOTHING so the migration is idempotent.
  - overall_risk is only upgraded, never downgraded.
*/

-- Step 1: Insert missing duplicate flags
INSERT INTO risk_flags (invoice_id, type, severity, message, status)
SELECT
  i.id,
  'duplicate_invoice_number',
  'high',
  'Duplicate invoice number "' || i.invoice_number || '" exists for vendor NIP ' || i.seller_nip || '.',
  'open'
FROM invoices i
WHERE i.invoice_number IS NOT NULL
  AND i.seller_nip    IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM invoices other
    WHERE other.company_id      = i.company_id
      AND other.invoice_number  = i.invoice_number
      AND other.seller_nip      = i.seller_nip
      AND other.id             <> i.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM risk_flags rf
    WHERE rf.invoice_id = i.id
      AND rf.type = 'duplicate_invoice_number'
  );

-- Step 2: Set overall_risk = 'high' on those invoices where it is currently
--         null, 'low', or 'medium'
UPDATE invoices i
SET overall_risk = 'high'
FROM risk_flags rf
WHERE rf.invoice_id = i.id
  AND rf.type       = 'duplicate_invoice_number'
  AND (i.overall_risk IS NULL OR i.overall_risk IN ('low', 'medium'));
