-- Allow public (anon) INSERTs on contact_submissions so the public
-- contact form works without the service role key.
-- SELECT remains admin-only (existing policy unchanged).

CREATE POLICY "Public can submit contact form"
  ON contact_submissions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
