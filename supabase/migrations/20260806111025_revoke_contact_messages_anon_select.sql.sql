/*
  # Revoke unnecessary SELECT from anon on contact_messages

  ## Summary
  Removes the SELECT privilege from the anon role on contact_messages.
  It was added in the previous migration to support .insert().select() but
  is no longer needed — the route now inserts without reading back the row.
  Only authenticated admins should be able to read messages.
*/

REVOKE SELECT ON contact_messages FROM anon;
