/*
# Add VAT White List (Biała Lista) verification infrastructure

## Purpose
When invoices are imported from KSeF, the platform verifies the vendor's bank
account against the Polish VAT White List. This migration adds the columns and
tables needed to store verification results, audit the checks, and mark vendor
bank accounts as verified.

## Changes

### 1. New columns on `invoices` table
- `white_list_status` (text, nullable) — one of: VALID, INVALID, NOT_FOUND, ERROR
- `white_list_verified_at` (timestamptz, nullable) — when the check was last run
- `white_list_company_name` (text, nullable) — company name from White List response
- `white_list_tax_id` (text, nullable) — NIP from White List response
- `white_list_bank_account` (text, nullable) — bank account that was checked
- `white_list_message` (text, nullable) — human-readable result message

### 2. New columns on `vendor_bank_accounts` table
- `verified_on_white_list` (boolean, default false) — whether this account was confirmed on the White List
- `verification_date` (timestamptz, nullable) — when the verification was performed

### 3. New table: `white_list_audit`
Stores audit entries for every White List check (auto and manual).
- `id` (uuid PK)
- `invoice_id` (uuid, FK to invoices, cascade delete)
- `vendor_id` (uuid, nullable, FK to vendors, set null on delete)
- `company_id` (uuid, FK to companies)
- `nip` (text) — vendor NIP checked
- `iban` (text) — bank account checked
- `result` (text) — VALID / INVALID / NOT_FOUND / ERROR
- `message` (text, nullable)
- `actor_id` (uuid, nullable) — user who triggered (null for automatic)
- `event_type` (text) — WHITE_LIST_CHECK_SUCCESS / WHITE_LIST_CHECK_FAILED / WHITE_LIST_RECHECK
- `created_at` (timestamptz, default now())

### 4. Indexes
- Index on `invoices(white_list_status)` for filtering
- Index on `invoices(white_list_verified_at)` for scheduled revalidation
- Index on `white_list_audit(invoice_id)` for lookups

### 5. RLS on `white_list_audit`
- SELECT/INSERT for authenticated users scoped to their company
- No UPDATE or DELETE (audit records are immutable)

### 6. Grants
- Grant SELECT, INSERT on white_list_audit to authenticated
- Grant SELECT, UPDATE on vendor_bank_accounts to authenticated (already exists, re-granted for safety)
*/

-- ─── 1. Add white_list columns to invoices ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'white_list_status') THEN
    ALTER TABLE public.invoices ADD COLUMN white_list_status text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'white_list_verified_at') THEN
    ALTER TABLE public.invoices ADD COLUMN white_list_verified_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'white_list_company_name') THEN
    ALTER TABLE public.invoices ADD COLUMN white_list_company_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'white_list_tax_id') THEN
    ALTER TABLE public.invoices ADD COLUMN white_list_tax_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'white_list_bank_account') THEN
    ALTER TABLE public.invoices ADD COLUMN white_list_bank_account text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'white_list_message') THEN
    ALTER TABLE public.invoices ADD COLUMN white_list_message text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_white_list_status
  ON public.invoices(white_list_status);

CREATE INDEX IF NOT EXISTS idx_invoices_white_list_verified_at
  ON public.invoices(white_list_verified_at);

-- ─── 2. Add verification columns to vendor_bank_accounts ──────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendor_bank_accounts' AND column_name = 'verified_on_white_list') THEN
    ALTER TABLE public.vendor_bank_accounts ADD COLUMN verified_on_white_list boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendor_bank_accounts' AND column_name = 'verification_date') THEN
    ALTER TABLE public.vendor_bank_accounts ADD COLUMN verification_date timestamptz;
  END IF;
END $$;

-- ─── 3. Create white_list_audit table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.white_list_audit (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid        REFERENCES public.invoices(id) ON DELETE CASCADE,
  vendor_id   uuid        REFERENCES public.vendors(id) ON DELETE SET NULL,
  company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nip         text        NOT NULL,
  iban        text        NOT NULL,
  result      text        NOT NULL,
  message     text,
  actor_id    uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  event_type  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_white_list_audit_invoice_id
  ON public.white_list_audit(invoice_id);

CREATE INDEX IF NOT EXISTS idx_white_list_audit_company_id
  ON public.white_list_audit(company_id);

-- ─── 4. RLS on white_list_audit ───────────────────────────────────────────────
ALTER TABLE public.white_list_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_white_list_audit" ON public.white_list_audit;
CREATE POLICY "select_white_list_audit"
  ON public.white_list_audit FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "insert_white_list_audit" ON public.white_list_audit;
CREATE POLICY "insert_white_list_audit"
  ON public.white_list_audit FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_user_company_id());

-- No UPDATE or DELETE policies — audit records are immutable.

GRANT SELECT, INSERT ON public.white_list_audit TO authenticated;
