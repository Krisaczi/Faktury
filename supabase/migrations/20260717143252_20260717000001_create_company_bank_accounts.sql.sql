-- ============================================================================
-- company_bank_accounts: structured bank account management for companies
--
-- Stores multiple bank accounts per company. Used as selectable payer accounts
-- when issuing invoices. Audit-logged via settings_audit.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_bank_accounts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_holder_name text        NOT NULL,
  iban                text        NOT NULL,
  bic                 text        NULL,
  bank_name           text        NULL,
  is_default          boolean     NOT NULL DEFAULT false,
  verified            boolean     NOT NULL DEFAULT false,
  metadata            jsonb       NULL,
  created_by          uuid        NULL REFERENCES public.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one IBAN per company
CREATE UNIQUE INDEX IF NOT EXISTS ux_company_bank_accounts_iban
  ON public.company_bank_accounts(company_id, iban);

-- Index for listing by company
CREATE INDEX IF NOT EXISTS idx_company_bank_accounts_company_id
  ON public.company_bank_accounts(company_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_bank_accounts_updated_at ON public.company_bank_accounts;
CREATE TRIGGER trg_company_bank_accounts_updated_at
  BEFORE UPDATE ON public.company_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.company_bank_accounts ENABLE ROW LEVEL SECURITY;

-- SELECT: owner/admin/accountant can view (accountant needs to pick account when invoicing)
CREATE POLICY "select_company_bank_accounts"
  ON public.company_bank_accounts FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_user_company_id()
  );

-- INSERT: only owner/admin
CREATE POLICY "insert_company_bank_accounts"
  ON public.company_bank_accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- UPDATE: only owner/admin
CREATE POLICY "update_company_bank_accounts"
  ON public.company_bank_accounts FOR UPDATE
  TO authenticated
  USING (
    company_id = public.get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    company_id = public.get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- DELETE: only owner
CREATE POLICY "delete_company_bank_accounts"
  ON public.company_bank_accounts FOR DELETE
  TO authenticated
  USING (
    company_id = public.get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- ─── Grant privileges ────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_bank_accounts TO authenticated;

-- ─── Add company_bank_account_id to issued_invoices ──────────────────────────
ALTER TABLE public.issued_invoices
  ADD COLUMN IF NOT EXISTS company_bank_account_id uuid NULL
  REFERENCES public.company_bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_issued_invoices_bank_account_id
  ON public.issued_invoices(company_bank_account_id);