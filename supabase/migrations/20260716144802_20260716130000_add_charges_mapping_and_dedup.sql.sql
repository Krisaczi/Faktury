-- Add page_number, bbox, and dedup unique index to invoice_charges
ALTER TABLE public.invoice_charges
  ADD COLUMN IF NOT EXISTS page_number integer;
ALTER TABLE public.invoice_charges
  ADD COLUMN IF NOT EXISTS bbox jsonb;

-- Dedupe: same invoice cannot have two charges with identical reason + amount
-- Use a hash expression index for stable dedup across reparse cycles
DROP INDEX IF EXISTS invoice_charges_invoice_id_reason_amount_uniq;
CREATE UNIQUE INDEX invoice_charges_invoice_id_reason_amount_uniq
  ON public.invoice_charges(invoice_id, md5(reason || '|' || amount::text));