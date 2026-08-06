/*
  # Fix contact_messages.ip_address type

  ## Summary
  Changes `contact_messages.ip_address` from `inet` to `text`.
  The Supabase JS client (PostgREST) cannot implicitly cast a JSON string
  to `inet`, which caused 500 errors when the contact form tried to insert
  the submitter's IP address. Using `text` avoids the cast issue while
  still storing the IP for rate-limiting/audit purposes.

  ## Modified Tables
  ### contact_messages
  - `ip_address`: changed from `inet` to `text` (no data loss — existing
    inet values are automatically converted to their text representation)
*/

ALTER TABLE contact_messages ALTER COLUMN ip_address TYPE text USING ip_address::text;
