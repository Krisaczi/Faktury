/*
# Add bank_name and bank_account_number to invoices

1. Adds two new nullable columns to `invoices`:
   - `bank_account_number` TEXT — the payment bank account number from KSeF <Platnosc>/<RachunekBankowy>/<NrRB>
   - `bank_name` TEXT — the bank name from KSeF <Platnosc>/<RachunekBankowy>/<NazwaBanku>
2. Backfills `bank_account_number` from the existing `bank_account` column so
   historical invoices carry over their bank account data.
3. Does NOT modify the existing `bank_account` column.
*/

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT;

UPDATE public.invoices
SET bank_account_number = bank_account
WHERE bank_account IS NOT NULL AND bank_account_number IS NULL;
