/*
  # Back-fill duplicate_invoice_date risk flags

  ## Summary
  Adds 'duplicate_invoice_date' flags to invoices that were inserted after an
  earlier copy with the same (company_id, invoice_number, seller_nip).

  The "later" invoice is identified by having a created_at strictly greater than
  the earliest existing copy. An exact timestamp match is skipped (already processed).

  ## Changes
  - Inserts risk_flags rows with type='duplicate_invoice_date', severity='high'
    for all qualifying invoices that don't already have this flag.
  - Sets overall_risk='high' on those invoices if not already high/critical.
*/

INSERT INTO risk_flags (invoice_id, type, severity, message, status)
SELECT
  i.id,
  'duplicate_invoice_date',
  'high',
  'Duplicate invoice detected based on creation date — an earlier copy already exists for vendor NIP ' || i.seller_nip || '.',
  'open'
FROM invoices i
WHERE i.invoice_number IS NOT NULL
  AND i.seller_nip IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM invoices earlier
    WHERE earlier.company_id     = i.company_id
      AND earlier.invoice_number = i.invoice_number
      AND earlier.seller_nip     = i.seller_nip
      AND earlier.id            <> i.id
      AND earlier.created_at     < i.created_at
  )
  AND NOT EXISTS (
    SELECT 1 FROM risk_flags rf
    WHERE rf.invoice_id = i.id
      AND rf.type = 'duplicate_invoice_date'
  );

UPDATE invoices i
SET overall_risk = 'high'
FROM risk_flags rf
WHERE rf.invoice_id = i.id
  AND rf.type = 'duplicate_invoice_date'
  AND (i.overall_risk IS NULL OR i.overall_risk IN ('low', 'medium'));
