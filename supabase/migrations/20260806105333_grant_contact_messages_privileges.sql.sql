/*
  # Grant table privileges on contact_messages

  ## Summary
  Grants the minimum required table-level privileges on `contact_messages`
  to the `anon` and `authenticated` roles.

  ## Why
  RLS policies alone are not sufficient — Postgres requires both a table
  privilege AND a matching RLS policy. The policies were created in the
  initial migration but the GRANT statements were missing, so the anon-key
  client (used by the public contact form) could not INSERT rows, resulting
  in 500 errors.

  ## Privileges granted
  - anon:        INSERT (public contact form submissions)
  - authenticated: SELECT, INSERT, UPDATE, DELETE (admin review panel)
*/

GRANT INSERT ON contact_messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON contact_messages TO authenticated;
