/*
# Migrate ingestion email domain from invoiceguard.app to bezpiecznefaktury.pl

## Purpose
All company ingestion_email addresses currently use @invoiceguard.app.
This migration updates every existing address to use @bezpiecznefaktury.pl
(the new official inbound email domain). The old domain is being fully
decommissioned.

## Changes
1. Updates all rows in `companies` where `ingestion_email` ends with
   `@invoiceguard.app` — replaces the domain with `@bezpiecznefaktury.pl`.
2. Preserves the local part (the company slug) of each address.

## Security
- No schema changes.
- No RLS policy changes.
- Data-only update, safe to re-run (idempotent — only affects rows still
  using the old domain).

## Important Notes
1. This is a bulk UPDATE on existing data — it does NOT drop or rename columns.
2. After this migration, all new companies created via onboarding will also
   use @bezpiecznefaktury.pl (the onboarding code was updated separately).
3. The old domain invoiceguard.app must be decommissioned at the mail provider
   (Mailgun/Resend/SES) — remove routes, mailboxes, and DNS records.
*/

UPDATE companies
SET ingestion_email = REPLACE(ingestion_email, '@invoiceguard.app', '@bezpiecznefaktury.pl'),
    updated_at      = now()
WHERE ingestion_email ILIKE '%@invoiceguard.app';
