/*
# Make ksef_debug_logs.invoice_id a loose UUID

## Why
The diagnostics system now logs debug events for BOTH invoice types:
- `issued_invoices` (user-created invoices shown in admin invoice detail)
- `platform_invoices` (SaaS billing invoices)

The existing FK constraint `ksef_debug_logs_invoice_id_fkey` references only
`platform_invoices(id)`, which means any insert with an `issued_invoices` ID
fails with a FK violation — no debug logs can be written for issued invoices.

## Changes
1. Drop the FK constraint `ksef_debug_logs_invoice_id_fkey`.
2. Keep `invoice_id` as `uuid` (no FK) so it accepts IDs from either table.
3. Add an index on `invoice_id` for diagnostics lookups (already likely present,
   created `IF NOT EXISTS` for safety).

## Security
No RLS or policy changes — the table already has owner-scoped RLS policies.
*/

ALTER TABLE ksef_debug_logs
  DROP CONSTRAINT IF EXISTS ksef_debug_logs_invoice_id_fkey;

CREATE INDEX IF NOT EXISTS ksef_debug_logs_invoice_id_idx
  ON ksef_debug_logs (invoice_id);
