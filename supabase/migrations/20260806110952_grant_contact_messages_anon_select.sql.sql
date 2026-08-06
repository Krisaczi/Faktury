/*
  # Grant SELECT to anon on contact_messages

  ## Summary
  Adds SELECT privilege for the anon role on contact_messages.
  The insert query uses .insert(...).select('id').single() to return the
  inserted row's id, which requires both INSERT and SELECT. Without SELECT,
  PostgREST returns "permission denied for table" even though INSERT was
  already granted.

  ## Modified Privileges
  - anon: now has SELECT + INSERT (was INSERT only)
*/

GRANT SELECT ON contact_messages TO anon;
