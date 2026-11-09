/*
# CEIDG auto-fill: company data fields, lookup cache and audit log

1. Modified Tables
- `buyer_companies` (customers): new columns `regon` (text), `building_number` (text), `apartment_number` (text), `website` (text), `ceidg_status` (text), `ceidg_checked_at` (timestamptz).
- `vendors`: new columns `regon`, `building_number`, `apartment_number`, `country` (text), `phone` (text), `website` (text), `ceidg_status` (text), `ceidg_checked_at` (timestamptz).

2. New Tables
- `ceidg_cache`: one row per NIP holding the last CEIDG response (`nip` primary key, `response` jsonb, `fetched_at`). Used for a 24-hour server-side cache.
- `ceidg_lookup_audit`: one row per lookup attempt (`nip`, `user_id`, `company_id`, `queried_at`, `lookup_success`, `ceidg_status`, `ceidg_company_name`, `error_code`).

3. Security
- Both new tables have RLS enabled with no policies, and are granted only to `service_role`. Only the server-side CEIDG lookup function reads or writes them; browsers cannot access them.
- No changes to existing policies on customers or vendors.

4. Notes
- All statements use IF NOT EXISTS, so this migration is safe to re-run.
- Existing rows keep NULL in every new column.
*/

ALTER TABLE buyer_companies
  ADD COLUMN IF NOT EXISTS regon text,
  ADD COLUMN IF NOT EXISTS building_number text,
  ADD COLUMN IF NOT EXISTS apartment_number text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS ceidg_status text,
  ADD COLUMN IF NOT EXISTS ceidg_checked_at timestamptz;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS regon text,
  ADD COLUMN IF NOT EXISTS building_number text,
  ADD COLUMN IF NOT EXISTS apartment_number text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS ceidg_status text,
  ADD COLUMN IF NOT EXISTS ceidg_checked_at timestamptz;

CREATE TABLE IF NOT EXISTS ceidg_cache (
  nip        text PRIMARY KEY,
  response   jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ceidg_lookup_audit (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nip                  text NOT NULL,
  user_id              uuid,
  company_id           uuid,
  queried_at           timestamptz NOT NULL DEFAULT now(),
  lookup_success       boolean NOT NULL,
  ceidg_status         text,
  ceidg_company_name   text,
  error_code           text
);

CREATE INDEX IF NOT EXISTS ceidg_lookup_audit_nip_idx ON ceidg_lookup_audit (nip, queried_at DESC);

ALTER TABLE ceidg_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceidg_lookup_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ceidg_cache, ceidg_lookup_audit FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ceidg_cache TO service_role;
GRANT SELECT, INSERT ON ceidg_lookup_audit TO service_role;
