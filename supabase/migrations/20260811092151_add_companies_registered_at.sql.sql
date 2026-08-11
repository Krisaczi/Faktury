/*
# Add companies.registered_at column with backfill and index

## Purpose
The Owner Dashboard needs a dedicated Registration Date column. Currently
the table uses `created_at` but has no explicit `registered_at` field. This
migration adds the column, backfills it from `created_at`, and adds an index
for efficient sorting/filtering by registration date.

## Changes
1. ALTER TABLE `companies`: add `registered_at timestamptz` (nullable —
   existing rows will be backfilled, new rows default to `now()`).
2. Backfill: set `registered_at = created_at` for all rows where NULL.
3. Set a default of `now()` so future inserts always have a value.
4. CREATE INDEX `idx_companies_registered_at` for query performance.

## Security
- No RLS changes needed: `registered_at` is accessible through the same
  SECURITY DEFINER RPC (`get_owner_dashboard_stats`) that already enforces
  Owner-only access via the `requireOwnerUser()` server action. No anon/
  public policy grants access to this column.

## Rollback
  DROP INDEX IF EXISTS idx_companies_registered_at;
  ALTER TABLE companies DROP COLUMN IF EXISTS registered_at;
*/

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS registered_at timestamptz;

UPDATE public.companies
SET registered_at = created_at
WHERE registered_at IS NULL;

ALTER TABLE public.companies
  ALTER COLUMN registered_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_companies_registered_at
  ON public.companies(registered_at);
