/*
# Allow negative line-item amounts for correction invoices

## Context
Correction invoices (faktura korygujaca) and credit notes require negative
quantities and amounts to reverse or reduce previously invoiced items.
The original schema enforced `CHECK (quantity > 0)` and `CHECK (net_amount >= 0)`
which blocked corrections entirely.

## Changes
1. `issued_invoice_items` — drop `CHECK (quantity > 0)` constraint, replace
   with no lower bound (quantities may be negative for corrections).
2. `issued_invoice_items` — drop non-negativity on `net_amount`, `vat_amount`,
   `gross_amount` (these can be negative for credit notes).
3. `issued_invoices` — drop non-negativity on `net_total`, `vat_total`,
   `gross_total` (totals can be negative for correction invoices).

## Security
No RLS or policy changes. Existing policies remain intact.
*/

-- issued_invoice_items: allow negative quantities and amounts
ALTER TABLE issued_invoice_items DROP CONSTRAINT IF EXISTS issued_invoice_items_quantity_check;
ALTER TABLE issued_invoice_items DROP CONSTRAINT IF EXISTS issued_invoice_items_net_amount_check;
ALTER TABLE issued_invoice_items DROP CONSTRAINT IF EXISTS issued_invoice_items_vat_amount_check;
ALTER TABLE issued_invoice_items DROP CONSTRAINT IF EXISTS issued_invoice_items_gross_amount_check;

-- issued_invoices: allow negative totals
ALTER TABLE issued_invoices DROP CONSTRAINT IF EXISTS issued_invoices_net_total_check;
ALTER TABLE issued_invoices DROP CONSTRAINT IF EXISTS issued_invoices_vat_total_check;
ALTER TABLE issued_invoices DROP CONSTRAINT IF EXISTS issued_invoices_gross_total_check;
