/*
# Add VAT exemption flag to platform invoices

1. Modified Tables
- `platform_invoices`
  - `vat_exempt` (boolean, not null, default false): true when the invoice is VAT-exempt ("Zwolniony"). Exempt invoices keep a 0% rate and are sent to KSeF with the exempt VAT code.

2. Security
- No changes to RLS policies or grants. The column inherits the table's existing access rules.

3. Important Notes
- Existing rows default to false, so no current invoice changes meaning.
- Uses IF NOT EXISTS so the migration can be re-run safely.
*/

ALTER TABLE platform_invoices ADD COLUMN IF NOT EXISTS vat_exempt boolean NOT NULL DEFAULT false;
