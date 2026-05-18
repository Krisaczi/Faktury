/*
  # Add unique constraint on vendors(company_id, nip)

  ## Summary
  Prevents duplicate vendor records with the same NIP within the same company.
  This makes upsert-by-NIP safe and avoids phantom duplicates when KSeF invoices
  are imported multiple times.

  ## Changes
  - New unique index: vendors(company_id, nip) WHERE nip IS NOT NULL
    (partial index so NULL nips are still allowed — a company may have
    multiple vendors with no NIP, e.g., foreign suppliers)

  ## Notes
  - Existing duplicates (same company_id + nip) must be resolved before the
    constraint can be applied. The DO block below deduplicates them first by
    keeping the oldest record (lowest created_at) and reassigning invoices.
*/

-- Step 1: Deduplicate — keep the oldest vendor per (company_id, nip), reassign invoices
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT company_id, nip, MIN(created_at) AS keep_created
    FROM vendors
    WHERE nip IS NOT NULL
    GROUP BY company_id, nip
    HAVING COUNT(*) > 1
  LOOP
    -- ID of the record we keep
    WITH keeper AS (
      SELECT id FROM vendors
      WHERE company_id = r.company_id AND nip = r.nip
      ORDER BY created_at ASC
      LIMIT 1
    ),
    dupes AS (
      SELECT v.id AS dupe_id, k.id AS keep_id
      FROM vendors v
      CROSS JOIN keeper k
      WHERE v.company_id = r.company_id
        AND v.nip = r.nip
        AND v.id <> k.id
    )
    -- Reassign invoices pointing at a dupe to the keeper
    UPDATE invoices
    SET vendor_id = d.keep_id
    FROM dupes d
    WHERE invoices.vendor_id = d.dupe_id;

    -- Delete the duplicates
    DELETE FROM vendors
    WHERE company_id = r.company_id
      AND nip = r.nip
      AND id NOT IN (
        SELECT id FROM vendors
        WHERE company_id = r.company_id AND nip = r.nip
        ORDER BY created_at ASC
        LIMIT 1
      );
  END LOOP;
END $$;

-- Step 2: Add the partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS vendors_company_nip_unique_idx
  ON vendors(company_id, nip)
  WHERE nip IS NOT NULL;
