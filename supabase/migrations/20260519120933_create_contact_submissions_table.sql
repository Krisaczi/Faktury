/*
  # Create contact_submissions table

  ## Summary
  Stores messages submitted via the public "Contact Us" modal on the homepage.
  No authentication is required to submit (public endpoint), so RLS is locked
  down to service-role-only writes from the API route, and admin reads.

  ## New Tables
  ### contact_submissions
  - id          : uuid PK
  - name        : sender's name (max 200 chars)
  - email       : sender's e-mail address
  - subject     : optional subject line
  - message     : message body (max 5000 chars)
  - ip_address  : submitter IP for rate-limit audit
  - created_at  : submission timestamp

  ## Security
  - RLS enabled — no public SELECT or INSERT policies.
  - The API route uses the service role key (server-side) to INSERT, bypassing RLS.
  - Authenticated admins can SELECT to review submissions.

  ## Notes
  1. No PII beyond name/email is stored — consistent with Privacy Policy.
  2. The ip_address column is used for audit/rate-limit verification only.
*/

CREATE TABLE IF NOT EXISTS contact_submissions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 2 AND 200),
  email       text        NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  subject     text        CHECK (char_length(subject) <= 300),
  message     text        NOT NULL CHECK (char_length(message) BETWEEN 10 AND 5000),
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_submissions_created_at_idx ON contact_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS contact_submissions_email_idx      ON contact_submissions(email);

ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- Admins (role = 'admin' in JWT app_metadata) can read all submissions
CREATE POLICY "Admins can read contact submissions"
  ON contact_submissions FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
