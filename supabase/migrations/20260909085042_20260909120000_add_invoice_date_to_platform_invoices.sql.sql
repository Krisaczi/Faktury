/*
# Add invoice_date column to platform_invoices

## Purpose
Allows the platform owner to manually set the invoice issue date when issuing
a platform-usage invoice, instead of always using the current date.

## Changes
1. Modified Table: `platform_invoices`
   - Added `invoice_date` (date, nullable). When NULL, the issue endpoint
     defaults it to the current date (preserving backward compatibility).
   - No NOT NULL constraint to avoid breaking existing rows.

## Security
- No RLS or policy changes — new column inherits existing table policies.

## Notes
- The issue endpoint will set `invoice_date` from the user-provided value
  or default to today's date if not specified.
- The draft endpoint may also store `invoice_date` if provided at draft time.
*/

ALTER TABLE public.platform_invoices
  ADD COLUMN IF NOT EXISTS invoice_date date;
