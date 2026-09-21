/*
# Create vendor_bank_accounts table

1. New Tables
- `vendor_bank_accounts`
  - `id` (uuid, primary key)
  - `vendor_id` (uuid, FK to vendors, cascade delete)
  - `bank_account_number` (text, not null) — IBAN or account number
  - `bank_name` (text, nullable) — name of the bank
  - `source` (text, not null, default 'invoice') — origin: 'invoice' or 'manual'
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())
2. Constraints
  - Unique on (vendor_id, bank_account_number) to prevent duplicates
3. Indexes
  - Index on vendor_id for fast lookups
4. Security
  - Enable RLS on vendor_bank_accounts
  - SELECT: authenticated users can view accounts for vendors in their company
  - INSERT: authenticated users can add accounts for vendors in their company
  - UPDATE: authenticated users can update accounts for vendors in their company
  - DELETE: authenticated users can delete accounts for vendors in their company
5. Notes
  - This table stores multiple bank accounts per vendor, populated automatically
    from invoice import/KSeF data or manually by users.
  - The existing vendors.bank_accounts JSON column remains for backwards compatibility.
*/

CREATE TABLE IF NOT EXISTS public.vendor_bank_accounts (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id            uuid        NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  bank_account_number  text        NOT NULL,
  bank_name            text        NULL,
  source               text        NOT NULL DEFAULT 'invoice',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_vendor_bank_accounts_vendor_iban
  ON public.vendor_bank_accounts(vendor_id, bank_account_number);

CREATE INDEX IF NOT EXISTS idx_vendor_bank_accounts_vendor_id
  ON public.vendor_bank_accounts(vendor_id);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_vendor_bank_accounts_updated_at ON public.vendor_bank_accounts;
CREATE TRIGGER trg_vendor_bank_accounts_updated_at
  BEFORE UPDATE ON public.vendor_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.vendor_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_vendor_bank_accounts" ON public.vendor_bank_accounts;
CREATE POLICY "select_vendor_bank_accounts"
  ON public.vendor_bank_accounts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = vendor_bank_accounts.vendor_id
        AND v.company_id = public.get_user_company_id()
    )
  );

DROP POLICY IF EXISTS "insert_vendor_bank_accounts" ON public.vendor_bank_accounts;
CREATE POLICY "insert_vendor_bank_accounts"
  ON public.vendor_bank_accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = vendor_bank_accounts.vendor_id
        AND v.company_id = public.get_user_company_id()
    )
  );

DROP POLICY IF EXISTS "update_vendor_bank_accounts" ON public.vendor_bank_accounts;
CREATE POLICY "update_vendor_bank_accounts"
  ON public.vendor_bank_accounts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = vendor_bank_accounts.vendor_id
        AND v.company_id = public.get_user_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = vendor_bank_accounts.vendor_id
        AND v.company_id = public.get_user_company_id()
    )
  );

DROP POLICY IF EXISTS "delete_vendor_bank_accounts" ON public.vendor_bank_accounts;
CREATE POLICY "delete_vendor_bank_accounts"
  ON public.vendor_bank_accounts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = vendor_bank_accounts.vendor_id
        AND v.company_id = public.get_user_company_id()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_bank_accounts TO authenticated;