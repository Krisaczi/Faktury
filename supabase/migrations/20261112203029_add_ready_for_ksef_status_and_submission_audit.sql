/*
# Add draft-to-KSeF workflow status values and audit columns

1. Changes to `issued_invoice_status` enum
- Adds `ready_for_ksef`: an invoice that passed the Validate Invoice check and may be submitted.
- Adds `rejected`: an invoice that KSeF rejected (already referenced by reporting functions).

2. Changes to `issued_invoices`
- `submitted_to_ksef_at` (timestamptz, nullable): when the invoice was sent to KSeF.
- `updated_by` (uuid, nullable): user who last changed the invoice.

3. Security
- No new tables. Existing row-level security and grants on `issued_invoices` are unchanged.

4. Notes
- No existing rows are modified. Existing `issued` rows keep their meaning.
- Statements are idempotent and safe to re-run.
*/

ALTER TYPE issued_invoice_status ADD VALUE IF NOT EXISTS 'ready_for_ksef';
ALTER TYPE issued_invoice_status ADD VALUE IF NOT EXISTS 'rejected';

ALTER TABLE issued_invoices ADD COLUMN IF NOT EXISTS submitted_to_ksef_at timestamptz;
ALTER TABLE issued_invoices ADD COLUMN IF NOT EXISTS updated_by uuid;
