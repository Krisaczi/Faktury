/*
# Create invoice_items table for received invoice line items

## Purpose
Persist parsed line items from received invoices (KSeF XML fetch, PDF upload,
OCR fallback). Each row represents one service/product line with description,
quantity, unit price, VAT breakdown, source provenance, and confidence score.

## New Table: public.invoice_items

| Column          | Type      | Description                                              |
|-----------------|-----------|----------------------------------------------------------|
| id              | uuid PK   | Default gen_random_uuid()                                |
| invoice_id      | uuid FK   | → invoices(id) ON DELETE CASCADE                         |
| position        | int       | 1-based line position within the invoice                 |
| description     | text      | Service/product name (P_7 in KSeF)                       |
| quantity        | numeric   | Quantity (P_8B)                                          |
| unit            | text      | Unit of measure (P_8A, e.g. "szt.", "kg")               |
| unit_price      | numeric   | Net unit price (P_9A)                                    |
| net_amount      | numeric   | Net line total (P_11)                                    |
| vat_rate        | text      | VAT rate string ("23", "8", "5", "0", "zw", "np", "oo") |
| vat_amount      | numeric   | VAT amount for this line                                 |
| gross_amount    | numeric   | Gross line total                                         |
| raw_text        | text      | Original extracted text (for audit/debug)                |
| source          | text      | Parsing source: 'ksef_xml', 'pdf_text', 'ocr', 'manual'  |
| confidence      | numeric   | 0.0–1.0 confidence score                                 |
| page_number     | int       | PDF page number (1-based, null for XML)                  |
| bbox            | jsonb     | Bounding box {x,y,width,height} for PDF overlay highlight |
| confirmed       | boolean   | Whether an owner/admin has confirmed this item           |
| confirmed_by    | uuid      | User ID who confirmed (nullable)                        |
| confirmed_at    | timestamptz | When confirmed (nullable)                              |
| created_at      | timestamptz | Default now()                                           |
| updated_at      | timestamptz | Default now()                                           |

## Indexes
- invoice_items_invoice_id_idx on invoice_id (for join queries)
- invoice_items_invoice_id_position_uniq UNIQUE on (invoice_id, position)

## Constraints
- confidence CHECK (confidence >= 0 AND confidence <= 1)
- source CHECK (source IN ('ksef_xml', 'pdf_text', 'ocr', 'manual'))

## RLS Policies
Scoped through parent invoices table's company_id:
- SELECT: all company members can view
- INSERT: owner, admin, accountant
- UPDATE: owner, admin, accountant
- DELETE: owner, admin
*/

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  position      integer NOT NULL DEFAULT 1,
  description   text,
  quantity      numeric,
  unit          text,
  unit_price    numeric,
  net_amount    numeric,
  vat_rate      text,
  vat_amount    numeric,
  gross_amount  numeric,
  raw_text      text,
  source        text NOT NULL DEFAULT 'manual',
  confidence    numeric DEFAULT 1.0,
  page_number   integer,
  bbox          jsonb,
  confirmed     boolean NOT NULL DEFAULT false,
  confirmed_by  uuid,
  confirmed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx
  ON public.invoice_items(invoice_id);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_items_invoice_id_position_uniq
  ON public.invoice_items(invoice_id, position);

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_confidence_check;
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_confidence_check
  CHECK (confidence >= 0 AND confidence <= 1);

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_source_check;
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_source_check
  CHECK (source IN ('ksef_xml', 'pdf_text', 'ocr', 'manual'));

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view invoice items"          ON public.invoice_items;
DROP POLICY IF EXISTS "Admins and accountants can insert invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Admins and accountants can update invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Admins can delete invoice items"                 ON public.invoice_items;

CREATE POLICY "Company members can view invoice items"
  ON public.invoice_items FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE company_id IN (
        SELECT company_id FROM public.users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins and accountants can insert invoice items"
  ON public.invoice_items FOR INSERT
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

CREATE POLICY "Admins and accountants can update invoice items"
  ON public.invoice_items FOR UPDATE
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

CREATE POLICY "Admins can delete invoice items"
  ON public.invoice_items FOR DELETE
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

GRANT ALL PRIVILEGES ON public.invoice_items TO authenticated;
