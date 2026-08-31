/*
# Deduplicate KSeF invoices and add unique index

## Purpose
Remove duplicate invoice rows that have the same (company_id, ksef_reference_number)
combination — caused by repeated KSeF fetches with no dedup protection — then create
a unique partial index to prevent future duplicates.

## Changes
1. Data cleanup
   - Deletes the newer duplicate rows for each (company_id, ksef_reference_number) pair,
     keeping only the oldest row (earliest created_at).
   - Child tables (risk_flags, invoice_items, invoice_charges, invoice_reviews) have
     CASCADE delete, so their rows are cleaned up automatically.
   - audit_logs has SET NULL on invoice_id, so audit records are preserved.

2. New Index
   - `invoices_ksef_reference_number_idx` — UNIQUE PARTIAL index on
     (company_id, ksef_reference_number) WHERE ksef_reference_number IS NOT NULL.
   - Prevents duplicate KSeF invoice inserts at the database level.

## Security
- No RLS or policy changes — data cleanup + index only.

## Notes
- This is a one-time data cleanup. Future KSeF fetches will skip duplicates
  via a pre-insert existence check, and this index is the hard DB-level guarantee.
*/

-- Step 1: Delete duplicate rows, keeping the oldest (earliest created_at) per pair
DELETE FROM public.invoices
WHERE id IN (
  SELECT id FROM (
    SELECT
      i.id,
      ROW_NUMBER() OVER (
        PARTITION BY i.company_id, i.ksef_reference_number
        ORDER BY i.created_at ASC, i.id ASC
      ) AS rn
    FROM public.invoices i
    WHERE i.ksef_reference_number IS NOT NULL
  ) ranked
  WHERE ranked.rn > 1
);

-- Step 2: Create the unique partial index
CREATE UNIQUE INDEX IF NOT EXISTS invoices_ksef_reference_number_idx
  ON public.invoices (company_id, ksef_reference_number)
  WHERE ksef_reference_number IS NOT NULL;
