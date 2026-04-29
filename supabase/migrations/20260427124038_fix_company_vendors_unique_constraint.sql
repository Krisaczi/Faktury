/*
  # Fix company_vendors unique constraint for upserts

  ## Problem
  The existing unique index on (company_id, nip) was created as a PARTIAL index
  (WHERE nip IS NOT NULL AND nip <> ''), but PostgreSQL's ON CONFLICT clause
  requires a plain (non-partial) unique constraint to work correctly.

  ## Changes
  - Drops the partial unique index `company_vendors_company_id_nip_unique_idx`
  - Creates a standard UNIQUE constraint on (company_id, nip)

  ## Notes
  1. The sync code filters out blank NIPs before calling upsert, so null/empty
     NIP rows will never be inserted — a plain constraint is safe here.
  2. This fixes the "there is no unique or exclusion constraint matching the
     ON CONFLICT specification" error in the invoice sync flow.
*/

DROP INDEX IF EXISTS company_vendors_company_id_nip_unique_idx;

ALTER TABLE company_vendors
  ADD CONSTRAINT company_vendors_company_id_nip_unique UNIQUE (company_id, nip);
