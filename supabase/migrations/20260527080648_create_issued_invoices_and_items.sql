/*
  # Create issued_invoices and issued_invoice_items tables

  ## Summary
  Introduces a first-class data model for invoices *issued* by our platform on
  behalf of tenants.  These are distinct from the existing `invoices` table, which
  stores *received* invoices that were uploaded or pulled from KSeF for risk
  analysis.  The new tables support the full KSeF FA(2) logical structure:
  seller/buyer parties, line items with per-item VAT rates, gross/net/VAT totals,
  and KSeF integration metadata.

  ## New Tables

  ### issued_invoices
  The invoice header.  One row per document.
  - id                 : uuid PK
  - company_id         : FK → companies(id) — the tenant issuing the invoice
  - invoice_number     : human-readable identifier (e.g. FV/2026/05/001), unique per company
  - status             : draft | issued | sent_to_ksef | accepted | rejected | cancelled
  - currency           : ISO 4217 code (default PLN)
  - issue_date         : date the document was created
  - sale_date          : date goods/services were delivered (KSeF: DataSprzedazy)
  - due_date           : payment deadline (KSeF: TerminPlatnosci)
  - payment_method     : transfer | cash | card | other
  - seller_name        : issuer company name  (KSeF: Podmiot1/DaneIdentyfikacyjne/Nazwa)
  - seller_nip         : issuer NIP 10-digit  (KSeF: Podmiot1/DaneIdentyfikacyjne/NIP)
  - seller_address     : full address string   (KSeF: Podmiot1/Adres)
  - seller_bank_account: IBAN / account number for payment
  - buyer_name         : recipient name        (KSeF: Podmiot2/DaneIdentyfikacyjne/Nazwa)
  - buyer_nip          : recipient NIP          (KSeF: Podmiot2/DaneIdentyfikacyjne/NIP)
  - buyer_address      : full address string   (KSeF: Podmiot2/Adres)
  - buyer_email        : optional — for sending the invoice
  - net_total          : sum of all items' net amounts  (KSeF: Fa/P_15)
  - vat_total          : sum of all items' VAT amounts  (KSeF: Fa/P_16–P_20 aggregated)
  - gross_total        : net_total + vat_total           (KSeF: Fa/P_9)
  - notes              : free-text internal notes / footer text
  - ksef_reference_no  : KSeF document reference number (KseF: NumerKSeF)
  - ksef_session_token : token returned by the KSeF API session
  - ksef_status        : pending | processing | accepted | rejected (mirrors KSeF processing state)
  - ksef_error_message : raw error from KSeF if rejected
  - ksef_sent_at       : timestamp when invoice was sent to KSeF
  - ksef_accepted_at   : timestamp when KSeF returned an accepted status

  ### issued_invoice_items
  One row per line item.  Supports multiple VAT rates on a single invoice
  (KSeF FA(2) allows mixed rates, each grouped under a separate P_xx field set).
  - id               : uuid PK
  - invoice_id       : FK → issued_invoices(id) ON DELETE CASCADE
  - position         : line number (1-based, for ordering / KSeF: LpSprzedazy)
  - name             : description of goods/service (KSeF: NazwaTowaru)
  - unit             : unit of measure, e.g. szt., kg, godz. (KSeF: JM)
  - quantity         : quantity sold as numeric(18,4)  (KSeF: Ilosc)
  - unit_price_net   : net unit price  (KSeF: CenaJednostkowa)
  - vat_rate         : VAT rate as text: '23', '8', '5', '0', 'zw', 'np', 'oo'
                       Stored as text to accommodate exempt/special values
                       (KSeF: StawkaPodatku)
  - net_amount       : quantity × unit_price_net, stored for auditability
  - vat_amount       : computed VAT for this line
  - gross_amount     : net_amount + vat_amount
  - discount_pct     : optional discount percentage (KSeF: Rabat)

  ## Indexes
  - issued_invoices(company_id, status)       — most common filter combination
  - issued_invoices(invoice_number)           — unique search, mandatory
  - issued_invoices(buyer_nip)               — counterparty lookup
  - issued_invoices(created_at DESC)         — chronological listing
  - issued_invoices(ksef_status)             — KSeF processing queue
  - issued_invoice_items(invoice_id)         — FK join (implicit but added explicit)

  ## Security
  RLS enabled on both tables.
  - Company members can read all invoices for their company.
  - Only owners and admins can insert/update.
  - Delete is intentionally blocked (use status = 'cancelled' instead).

  ## KSeF FA(2) Mapping Notes
  - Podmiot1  → seller_* columns
  - Podmiot2  → buyer_* columns
  - Fa/P_2    → invoice_number
  - Fa/P_1    → issue_date
  - Fa/DataSprzedazy → sale_date
  - Fa/TerminPlatnosci → due_date
  - FaWiersz  → one issued_invoice_items row per element
  - FaWiersz/StawkaPodatku → vat_rate
  - NumerKSeF → ksef_reference_no
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUM types
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE issued_invoice_status AS ENUM (
    'draft',
    'issued',
    'sent_to_ksef',
    'accepted',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE issued_invoice_payment_method AS ENUM (
    'transfer',
    'cash',
    'card',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ksef_processing_status AS ENUM (
    'pending',
    'processing',
    'accepted',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- issued_invoices
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS issued_invoices (
  id                   uuid                         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid                         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Document identity
  invoice_number       text                         NOT NULL,
  status               issued_invoice_status        NOT NULL DEFAULT 'draft',
  currency             char(3)                      NOT NULL DEFAULT 'PLN',

  -- Dates
  issue_date           date                         NOT NULL DEFAULT CURRENT_DATE,
  sale_date            date,
  due_date             date,

  -- Payment
  payment_method       issued_invoice_payment_method NOT NULL DEFAULT 'transfer',

  -- Seller (Podmiot1)
  seller_name          text                         NOT NULL,
  seller_nip           text                         NOT NULL CHECK (seller_nip ~ '^\d{10}$'),
  seller_address       text                         NOT NULL,
  seller_bank_account  text,

  -- Buyer (Podmiot2)
  buyer_name           text                         NOT NULL,
  buyer_nip            text                         CHECK (buyer_nip IS NULL OR buyer_nip ~ '^\d{10}$'),
  buyer_address        text                         NOT NULL DEFAULT '',
  buyer_email          text,

  -- Totals (all in minor units of the currency, stored as numeric for precision)
  net_total            numeric(18, 2)               NOT NULL DEFAULT 0,
  vat_total            numeric(18, 2)               NOT NULL DEFAULT 0,
  gross_total          numeric(18, 2)               NOT NULL DEFAULT 0,

  -- Free text / footer
  notes                text,

  -- KSeF integration
  ksef_reference_no    text,
  ksef_session_token   text,
  ksef_status          ksef_processing_status,
  ksef_error_message   text,
  ksef_sent_at         timestamptz,
  ksef_accepted_at     timestamptz,

  -- Audit
  created_by           uuid                         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz                  NOT NULL DEFAULT now(),
  updated_at           timestamptz                  NOT NULL DEFAULT now(),

  -- Enforce unique invoice numbers per company
  CONSTRAINT uq_issued_invoices_number UNIQUE (company_id, invoice_number)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- issued_invoice_items
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS issued_invoice_items (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid           NOT NULL REFERENCES issued_invoices(id) ON DELETE CASCADE,

  position         smallint       NOT NULL CHECK (position > 0),
  name             text           NOT NULL,
  unit             text           NOT NULL DEFAULT 'szt.',
  quantity         numeric(18, 4) NOT NULL CHECK (quantity > 0),
  unit_price_net   numeric(18, 4) NOT NULL,

  -- VAT rate: '23', '8', '5', '0', 'zw' (exempt), 'np' (not applicable), 'oo' (reverse charge)
  vat_rate         text           NOT NULL DEFAULT '23'
                   CHECK (vat_rate IN ('23', '8', '5', '0', 'zw', 'np', 'oo')),

  -- Stored amounts — derived from quantity × unit_price_net but kept for auditability
  net_amount       numeric(18, 2) NOT NULL,
  vat_amount       numeric(18, 2) NOT NULL DEFAULT 0,
  gross_amount     numeric(18, 2) NOT NULL,

  -- Optional discount (KSeF: Rabat), expressed as a percentage
  discount_pct     numeric(5, 2)  CHECK (discount_pct IS NULL OR (discount_pct >= 0 AND discount_pct < 100)),

  created_at       timestamptz    NOT NULL DEFAULT now(),

  -- Items must be ordered 1..N within an invoice
  CONSTRAINT uq_invoice_item_position UNIQUE (invoice_id, position)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_issued_invoices_company_status
  ON issued_invoices(company_id, status);

CREATE INDEX IF NOT EXISTS idx_issued_invoices_invoice_number
  ON issued_invoices(invoice_number);

CREATE INDEX IF NOT EXISTS idx_issued_invoices_buyer_nip
  ON issued_invoices(buyer_nip)
  WHERE buyer_nip IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_issued_invoices_created_at
  ON issued_invoices(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_issued_invoices_ksef_status
  ON issued_invoices(ksef_status)
  WHERE ksef_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_issued_invoice_items_invoice_id
  ON issued_invoice_items(invoice_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- auto-update updated_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trg_issued_invoices_updated_at'
  ) THEN
    CREATE TRIGGER trg_issued_invoices_updated_at
      BEFORE UPDATE ON issued_invoices
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE issued_invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE issued_invoice_items ENABLE ROW LEVEL SECURITY;

-- issued_invoices —————————————————————————————————————————————————————————————

CREATE POLICY "Company members can view issued invoices"
  ON issued_invoices FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Owners and admins can insert issued invoices"
  ON issued_invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('owner', 'admin')
  );

CREATE POLICY "Owners and admins can update issued invoices"
  ON issued_invoices FOR UPDATE
  TO authenticated
  USING (company_id = get_user_company_id())
  WITH CHECK (
    company_id = get_user_company_id()
    AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('owner', 'admin')
  );

-- issued_invoice_items ————————————————————————————————————————————————————————

CREATE POLICY "Company members can view invoice items"
  ON issued_invoice_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM issued_invoices ii
      WHERE ii.id = invoice_id
        AND ii.company_id = get_user_company_id()
    )
  );

CREATE POLICY "Owners and admins can insert invoice items"
  ON issued_invoice_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM issued_invoices ii
      WHERE ii.id = invoice_id
        AND ii.company_id = get_user_company_id()
    )
    AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('owner', 'admin')
  );

CREATE POLICY "Owners and admins can update invoice items"
  ON issued_invoice_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM issued_invoices ii
      WHERE ii.id = invoice_id
        AND ii.company_id = get_user_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM issued_invoices ii
      WHERE ii.id = invoice_id
        AND ii.company_id = get_user_company_id()
    )
    AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('owner', 'admin')
  );

CREATE POLICY "Owners and admins can delete invoice items"
  ON issued_invoice_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM issued_invoices ii
      WHERE ii.id = invoice_id
        AND ii.company_id = get_user_company_id()
    )
    AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('owner', 'admin')
  );
