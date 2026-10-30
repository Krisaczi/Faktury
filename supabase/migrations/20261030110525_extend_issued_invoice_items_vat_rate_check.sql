/*
# Allow all VAT rate codes on issued invoice line items

1. What changed
- The VAT rate column on issued invoice line items only accepted the original short codes.
- The invoice form also offers 0% KR, 0% WDT, 0% EX and Np II (stored as 0_kr, 0_wdt, 0_ex, np_ii), so saving those lines failed.

2. Modified table
- issued_invoice_items: the vat_rate check constraint is replaced with one that also accepts 0_kr, 0_wdt, 0_ex and np_ii.
- Existing values ('23', '8', '5', '0', 'zw', 'np', 'oo') remain valid, so no data changes.

3. Security
- No changes to row level security, policies or grants.

4. Notes
- Idempotent: the old constraint is dropped only if it exists, and the new one is added after that.
*/

ALTER TABLE issued_invoice_items DROP CONSTRAINT IF EXISTS issued_invoice_items_vat_rate_check;

ALTER TABLE issued_invoice_items
  ADD CONSTRAINT issued_invoice_items_vat_rate_check
  CHECK (vat_rate IN ('23', '8', '5', '0', '0_kr', '0_wdt', '0_ex', 'zw', 'np', 'np_ii', 'oo'));
