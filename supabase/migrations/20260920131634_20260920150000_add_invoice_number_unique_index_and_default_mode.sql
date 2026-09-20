/*
# Add unique index on (company_id, invoice_number) and default numbering mode setting

## Changes

### 1. Unique index on issued_invoices
- Creates a unique partial index on `(company_id, invoice_number)` for `issued_invoices`
  where `invoice_number IS NOT NULL`. This prevents duplicate invoice numbers within
  the same company while allowing different companies to use the same number.
- Existing non-unique index `idx_issued_invoices_invoice_number` is dropped since the
  new unique index covers the same query patterns.

### 2. Default numbering mode on companies
- Adds `invoice_numbering_mode` column to `companies` table.
- Values: 'auto' (default) or 'manual'.
- When 'auto', the system generates invoice numbers automatically.
- When 'manual', the user is prompted to enter a number but can still switch to auto.

### 3. Unique index on platform_invoices invoice_number
- Adds a unique index on `invoice_number` for `platform_invoices` where the number
  is not null, preventing duplicate owner-issued invoice numbers.
*/

-- 1. Replace non-unique index with unique partial index on issued_invoices
DROP INDEX IF EXISTS idx_issued_invoices_invoice_number;
CREATE UNIQUE INDEX IF NOT EXISTS uq_issued_invoices_company_invoice_number
  ON issued_invoices (company_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

-- 2. Add default numbering mode to companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS invoice_numbering_mode text NOT NULL DEFAULT 'auto'
  CHECK (invoice_numbering_mode IN ('auto', 'manual'));

-- 3. Unique index on platform_invoices invoice_number (owner-issued invoices)
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_invoices_invoice_number
  ON platform_invoices (invoice_number)
  WHERE invoice_number IS NOT NULL;
