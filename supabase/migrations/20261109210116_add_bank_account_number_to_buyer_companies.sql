/*
# Add bank account number to customers

## What changes
Customers (stored in buyer_companies) can now carry a bank account number,
so it can be recorded when adding or editing a customer.

## Changes
1. buyer_companies: new nullable column `bank_account_number` (text).
   - Existing customers are unaffected; the value stays empty until set.
   - Stores the normalized IBAN (spaces removed, uppercase), validated in the app.

## Security
- No new tables, policies, or grants. The column inherits the existing
  buyer_companies row-level security and table privileges.

## Notes
- Additive only: no data is removed or changed.
*/

ALTER TABLE public.buyer_companies
  ADD COLUMN IF NOT EXISTS bank_account_number text NULL;
