/*
# Controlled vendor bank account approval workflow

1. Summary
Vendor bank accounts are no longer added automatically from uploaded invoices.
A bank account only becomes part of a vendor profile when a user approves it.
Every decision (approval or keeping an account for one invoice only) is written
to an audit table.

2. Modified table: vendor_bank_accounts
- `approved` (boolean, not null, default false): true when a user approved the account.
- `approved_at` (timestamptz): when the account was approved.
- `approved_by` (uuid, references auth.users, on delete set null): who approved it.
- Existing rows are backfilled: rows added manually or verified on the White List are
  approved; rows that were added automatically from invoices stay unapproved so the
  next invoice from that vendor asks for a decision.

3. New table: vendor_bank_account_audit
- Immutable log of decisions: company, vendor, invoice, action, previously approved
  accounts, the new account, White List status, whether the vendor profile changed,
  acting user and timestamp.
- Only SELECT and INSERT are granted. No update or delete.

4. New function: record_vendor_bank_account_decision(invoice, action, white list status)
- Runs as the calling user (SECURITY INVOKER) so row level security applies.
- action 'account_added': approves the invoice's bank account on the vendor profile and
  writes an audit row, in one transaction.
- action 'kept_for_invoice': writes an audit row only; the vendor profile is unchanged.

5. Security
- RLS enabled on the audit table; rows are scoped to the user's company.
- Function is callable by authenticated users only.
*/

ALTER TABLE public.vendor_bank_accounts
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.vendor_bank_accounts
SET approved = true,
    approved_at = COALESCE(approved_at, created_at)
WHERE approved = false
  AND (source = 'manual' OR verified_on_white_list = true);

CREATE TABLE IF NOT EXISTS public.vendor_bank_account_audit (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vendor_id           uuid        NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  invoice_id          uuid        NULL REFERENCES public.invoices(id) ON DELETE SET NULL,
  action              text        NOT NULL CHECK (action IN ('account_added', 'kept_for_invoice')),
  old_accounts        text[]      NOT NULL DEFAULT '{}',
  new_account         text        NOT NULL,
  white_list_status   text        NOT NULL CHECK (white_list_status IN ('VALID', 'INVALID', 'NOT_FOUND', 'ERROR')),
  vendor_updated      boolean     NOT NULL,
  user_id             uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_bank_account_audit_invoice
  ON public.vendor_bank_account_audit(invoice_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bank_account_audit_vendor
  ON public.vendor_bank_account_audit(vendor_id);

ALTER TABLE public.vendor_bank_account_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_vendor_bank_account_audit" ON public.vendor_bank_account_audit;
CREATE POLICY "select_vendor_bank_account_audit"
  ON public.vendor_bank_account_audit FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "insert_vendor_bank_account_audit" ON public.vendor_bank_account_audit;
CREATE POLICY "insert_vendor_bank_account_audit"
  ON public.vendor_bank_account_audit FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() AND user_id = auth.uid());

GRANT SELECT, INSERT ON public.vendor_bank_account_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.record_vendor_bank_account_decision(
  p_invoice_id uuid,
  p_action text,
  p_white_list_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid := public.get_user_company_id();
  v_invoice invoices%ROWTYPE;
  v_account text;
  v_old_accounts text[];
  v_vendor_updated boolean := false;
  v_verified boolean;
BEGIN
  IF p_action NOT IN ('account_added', 'kept_for_invoice') THEN
    RAISE EXCEPTION 'INVALID_ACTION' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_invoice.vendor_id IS NULL THEN
    RAISE EXCEPTION 'VENDOR_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_account := regexp_replace(upper(coalesce(v_invoice.bank_account, '')), '[[:space:]-]', '', 'g');
  IF v_account = '' THEN
    RAISE EXCEPTION 'NO_BANK_ACCOUNT' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(bank_account_number ORDER BY created_at), '{}')
  INTO v_old_accounts
  FROM public.vendor_bank_accounts
  WHERE vendor_id = v_invoice.vendor_id AND approved = true;

  IF p_action = 'account_added' THEN
    v_verified := p_white_list_status = 'VALID';

    INSERT INTO public.vendor_bank_accounts (
      vendor_id, bank_account_number, source, approved, approved_at, approved_by,
      verified_on_white_list, verification_date
    )
    VALUES (
      v_invoice.vendor_id,
      v_account,
      CASE WHEN v_verified THEN 'white_list_verified' ELSE 'manual' END,
      true,
      now(),
      auth.uid(),
      v_verified,
      CASE WHEN v_verified THEN now() ELSE NULL END
    )
    ON CONFLICT (vendor_id, bank_account_number) DO UPDATE SET
      approved = true,
      approved_at = now(),
      approved_by = auth.uid(),
      verified_on_white_list = public.vendor_bank_accounts.verified_on_white_list OR EXCLUDED.verified_on_white_list,
      verification_date = COALESCE(EXCLUDED.verification_date, public.vendor_bank_accounts.verification_date);

    v_vendor_updated := true;
  END IF;

  INSERT INTO public.vendor_bank_account_audit (
    company_id, vendor_id, invoice_id, action, old_accounts, new_account,
    white_list_status, vendor_updated, user_id
  )
  VALUES (
    v_company_id, v_invoice.vendor_id, p_invoice_id, p_action, v_old_accounts, v_account,
    p_white_list_status, v_vendor_updated, auth.uid()
  );

  RETURN jsonb_build_object('vendor_id', v_invoice.vendor_id, 'vendor_updated', v_vendor_updated);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_vendor_bank_account_decision(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_vendor_bank_account_decision(uuid, text, text) TO authenticated;
