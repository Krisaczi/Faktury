/*
  # Duplicate Invoice Detection Index

  ## Summary
  Adds an index to accelerate duplicate invoice detection queries.
  The duplicate check matches on (company_id, invoice_number, seller_nip) — the
  canonical combination that identifies "same invoice from the same vendor".

  ## Changes
  - New index: invoices(company_id, invoice_number, seller_nip)
    WHERE invoice_number IS NOT NULL AND seller_nip IS NOT NULL
    (partial index — only indexes rows that have both fields, which are the only
    rows that can have meaningful duplicates)

  ## Notes
  - This is a non-unique index — duplicates are allowed and flagged rather than
    rejected, so reviewers can decide what to do with them.
  - The risk flag type used is 'duplicate_invoice_number' with severity 'high'.
*/

CREATE INDEX IF NOT EXISTS invoices_duplicate_detection_idx
  ON invoices(company_id, invoice_number, seller_nip)
  WHERE invoice_number IS NOT NULL AND seller_nip IS NOT NULL;
