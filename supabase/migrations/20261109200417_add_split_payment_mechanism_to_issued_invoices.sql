/*
# Add split payment mechanism (MPP) flag to issued invoices

1. Modified Tables
- `issued_invoices`: new column `split_payment_mechanism` (boolean, NOT NULL, default false).

2. Purpose
- Lets a regular invoice be marked as subject to the mandatory split payment mechanism (MPP).
- Drives FA(3) `Adnotacje/P_18A` (1 = yes, 2 = no) when the invoice is sent to KSeF.

3. Security
- No RLS or grant changes; the table's existing policies apply to the new column.

4. Notes
- Default false keeps all existing invoices on P_18A = 2, so no existing data changes meaning.
- Idempotent: uses ADD COLUMN IF NOT EXISTS.
*/

ALTER TABLE issued_invoices
  ADD COLUMN IF NOT EXISTS split_payment_mechanism boolean NOT NULL DEFAULT false;
