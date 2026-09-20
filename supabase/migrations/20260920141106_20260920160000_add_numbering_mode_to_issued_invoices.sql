/*
# Add numbering_mode column to issued_invoices

## Purpose
Persist whether an invoice's number was entered manually or auto-generated,
so the system never overwrites a manual number during issuance, PDF rendering,
or KSeF submission.

## Changes

### 1. New column on issued_invoices
- `numbering_mode` (text, NOT NULL, DEFAULT 'automatic')
  - Values: 'manual' | 'automatic'
  - Existing invoices default to 'automatic' (safe — existing behavior unchanged)

### 2. CHECK constraint
- Ensures only 'manual' or 'automatic' values are accepted.

## Security
- No RLS or policy changes. Existing RLS on issued_invoices remains intact.

## Notes
- Existing invoices are NOT modified — only new inserts get the default.
- The application code reads this column to decide whether to generate
  a sequence number or keep the user-entered one.
*/