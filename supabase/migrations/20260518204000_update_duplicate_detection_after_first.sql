/*
  # Update Duplicate Invoice Detection — Flag Only After First

  ## Summary
  Replaces the old "any duplicate is flagged" approach with a precise rule:
  only invoices created **after** the earliest invoice for the same
  (company_id, invoice_number, seller_nip) tuple are flagged.

  ## Changes

  ### New Index
  - `invoices_dup_after_first_idx` on (company_id, invoice_number, seller_nip, created_at)
    Replaces the existing simpler index; supports the MIN(created_at) lookup efficiently.

  ### New Flag Type
  - `duplicate_invoice_after_first` — severity high
    Replaces `duplicate_invoice_number` and `duplicate_invoice_date` for the "after first"
    semantic. The original invoice is never flagged.

  ### Backfill
  1. Remove incorrect flags:
     - Delete `duplicate_invoice_number` and `duplicate_invoice_date` flags from the
       *original* (earliest-created) invoice in each duplicate group — it should not be flagged.
  2. Insert `duplicate_invoice_after_first` flags for all invoices that are NOT the original.
  3. Ensure `overall_risk = 'high'` on those invoices.
  4. Clear `overall_risk` back to NULL on original invoices that have no remaining open flags
     (they were incorrectly set to 'high' by the old backfill).

  ## Security
  - No RLS changes; all operations are scoped by company_id.
*/

-- ─── New compound index ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS invoices_dup_after_first_idx
  ON invoices (company_id, invoice_number, seller_nip, created_at)
  WHERE invoice_number IS NOT NULL AND seller_nip IS NOT NULL;

-- ─── Step 1: Remove duplicate flags from the ORIGINAL (first) invoice ─────────
-- The original = invoice with MIN(created_at) for its (company_id, invoice_number, seller_nip).
-- It should never carry duplicate flags.
DELETE FROM risk_flags
WHERE type IN ('duplicate_invoice_number', 'duplicate_invoice_date')
  AND invoice_id IN (
    SELECT DISTINCT ON (company_id, invoice_number, seller_nip) id
    FROM invoices
    WHERE invoice_number IS NOT NULL
      AND seller_nip     IS NOT NULL
    ORDER BY company_id, invoice_number, seller_nip, created_at ASC
  );

-- ─── Step 2: Insert duplicate_invoice_after_first for later invoices ──────────
INSERT INTO risk_flags (invoice_id, type, severity, message, status)
SELECT
  later.id,
  'duplicate_invoice_after_first',
  'high',
  'Duplicate invoice detected — an earlier copy of this invoice number already exists for this vendor.',
  'open'
FROM invoices later
JOIN (
  -- earliest invoice per (company_id, invoice_number, seller_nip)
  SELECT DISTINCT ON (company_id, invoice_number, seller_nip)
    id            AS original_id,
    company_id,
    invoice_number,
    seller_nip,
    created_at    AS original_created_at
  FROM invoices
  WHERE invoice_number IS NOT NULL
    AND seller_nip     IS NOT NULL
  ORDER BY company_id, invoice_number, seller_nip, created_at ASC
) first_inv
  ON  later.company_id     = first_inv.company_id
  AND later.invoice_number = first_inv.invoice_number
  AND later.seller_nip     = first_inv.seller_nip
  AND later.id            <> first_inv.original_id
  -- Only flag if the gap is more than 1 minute (avoid false positives from batch uploads)
  AND EXTRACT(EPOCH FROM (later.created_at - first_inv.original_created_at)) > 60
ON CONFLICT DO NOTHING;

-- ─── Step 3: Set overall_risk = 'high' on all newly-flagged invoices ──────────
UPDATE invoices
SET overall_risk = 'high'
WHERE id IN (
  SELECT invoice_id FROM risk_flags
  WHERE type = 'duplicate_invoice_after_first'
    AND status = 'open'
)
AND (overall_risk IS NULL OR overall_risk NOT IN ('high', 'critical'));

-- ─── Step 4: Re-evaluate originals that were incorrectly marked high ──────────
-- If the original invoice now has no open high/critical flags, downgrade overall_risk.
UPDATE invoices orig
SET overall_risk = COALESCE(
  (
    SELECT
      CASE
        WHEN bool_or(severity = 'high' OR severity = 'critical') THEN 'high'
        WHEN bool_or(severity = 'medium')                        THEN 'medium'
        ELSE                                                          'low'
      END
    FROM risk_flags
    WHERE invoice_id = orig.id
      AND status = 'open'
  ),
  NULL
)
WHERE orig.id IN (
  -- Only touch invoices that are originals (min created_at in their group)
  SELECT DISTINCT ON (company_id, invoice_number, seller_nip) id
  FROM invoices
  WHERE invoice_number IS NOT NULL
    AND seller_nip     IS NOT NULL
  ORDER BY company_id, invoice_number, seller_nip, created_at ASC
);
