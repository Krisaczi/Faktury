/*
# Create invoice_charges table and invoice-level charge fields

## Purpose
Persist the KSeF <Rozliczenie> section — specifically <Obciazenia> entries
(charges/debits), <SumaObciazen> (total charges), and <DoZaplaty> (amount due).
Each row represents one Obciazenia entry with amount + reason.

## New Table: public.invoice_charges

| Column        | Type        | Description                                              |
|---------------|-------------|----------------------------------------------------------|
| id            | uuid PK     | Default gen_random_uuid()                                |
| invoice_id    | uuid FK     | → invoices(id) ON DELETE CASCADE                         |
| amount        | numeric     | Charge amount (Kwota)                                    |
| reason        | text        | Charge reason (Powod)                                    |
| source        | text        | Parsing source: 'ksef', 'pdf_text', 'ocr', 'manual'      |
| confidence    | numeric     | 0.0–1.0 confidence score                                 |
| confirmed     | boolean     | Whether an owner/admin has confirmed this charge         |
| confirmed_by  | uuid        | User ID who confirmed (nullable)                         |
| confirmed_at  | timestamptz | When confirmed (nullable)                                |
| created_at    | timestamptz | Default now()                                            |
| updated_at    | timestamptz | Default now()                                            |

## Altered Table: public.invoices
- charges_total numeric  — SumaObciazen
- amount_due     numeric  — DoZaplaty

## Indexes
- invoice_charges_invoice_id_idx on invoice_id

## Constraints
- confidence CHECK (confidence >= 0 AND confidence <= 1)
- source CHECK (source IN ('ksef', 'pdf_text', 'ocr', 'manual'))

## RLS Policies
Scoped through parent invoices table's company_id:
- SELECT: all company members can view
- INSERT: owner, admin, accountant
- UPDATE: owner, admin, accountant
- DELETE: owner, admin
*/

CREATE TABLE IF NOT EXISTS public.invoice_charges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount        numeric NOT NULL,
  reason        text NOT NULL,
  source        text NOT NULL DEFAULT 'ksef',
  confidence    numeric DEFAULT 1.0,
  confirmed     boolean NOT NULL DEFAULT false,
  confirmed_by  uuid,
  confirmed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_charges_invoice_id
  ON public.invoice_charges(invoice_id);

ALTER TABLE public.invoice_charges
  DROP CONSTRAINT IF EXISTS invoice_charges_confidence_check;
ALTER TABLE public.invoice_charges
  ADD CONSTRAINT invoice_charges_confidence_check
  CHECK (confidence >= 0 AND confidence <= 1);

ALTER TABLE public.invoice_charges
  DROP CONSTRAINT IF EXISTS invoice_charges_source_check;
ALTER TABLE public.invoice_charges
  ADD CONSTRAINT invoice_charges_source_check
  CHECK (source IN ('ksef', 'pdf_text', 'ocr', 'manual'));

-- Add invoice-level charge summary columns
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS charges_total numeric;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS amount_due numeric;

ALTER TABLE public.invoice_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view invoice charges"          ON public.invoice_charges;
DROP POLICY IF EXISTS "Admins and accountants can insert invoice charges" ON public.invoice_charges;
DROP POLICY IF EXISTS "Admins and accountants can update invoice charges" ON public.invoice_charges;
DROP POLICY IF EXISTS "Admins can delete invoice charges"                 ON public.invoice_charges;

CREATE POLICY "Company members can view invoice charges"
  ON public.invoice_charges FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE company_id IN (
        SELECT company_id FROM public.users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins and accountants can insert invoice charges"
  ON public.invoice_charges FOR INSERT
  TO authenticated
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE company_id IN (
        SELECT company_id FROM public.users
        WHERE id = auth.uid() AND role IN ('owner', 'admin', 'accountant')
      )
    )
  );

CREATE POLICY "Admins and accountants can update invoice charges"
  ON public.invoice_charges FOR UPDATE
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE company_id IN (
        SELECT company_id FROM public.users
        WHERE id = auth.uid() AND role IN ('owner', 'admin', 'accountant')
      )
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE company_id IN (
        SELECT company_id FROM public.users
        WHERE id = auth.uid() AND role IN ('owner', 'admin', 'accountant')
      )
    )
  );

CREATE POLICY "Admins can delete invoice charges"
  ON public.invoice_charges FOR DELETE
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE company_id IN (
        SELECT company_id FROM public.users
        WHERE id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

GRANT ALL PRIVILEGES ON public.invoice_charges TO authenticated;