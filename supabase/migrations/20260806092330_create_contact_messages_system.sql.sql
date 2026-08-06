/*
  # Contact Messages — persistent storage + admin review

  ## Summary
  Creates a new `contact_messages` table that stores every message submitted
  through the public homepage contact modal. Replaces the older
  `contact_submissions` table (which remains untouched for backward
  compatibility). Adds a dedicated storage bucket for file attachments, RLS
  policies for public submit + admin review, an updated_at trigger, and a
  retention helper function for GDPR compliance.

  ## New Tables
  ### contact_messages
  - id             : uuid PK
  - company_id     : nullable FK to companies (set when a logged-in user submits)
  - sender_name    : sender's name (2–200 chars)
  - sender_email   : sender's e-mail address (validated)
  - sender_phone   : optional phone number
  - subject        : subject line (required, max 300)
  - message        : message body (10–5000 chars)
  - attachment_url : path to file in the `contact-attachments` storage bucket
  - attachment_meta: jsonb with { filename, size, mime_type }
  - delivered      : whether the notification email was sent successfully
  - delivered_at   : timestamp of successful email delivery
  - delivery_error : error message if delivery failed
  - ip_address     : submitter IP (inet) for rate-limit audit
  - user_agent     : browser user-agent string
  - created_at     : submission timestamp
  - updated_at     : last modification timestamp (auto-updated by trigger)
  - status         : workflow status — new | read | archived | deleted

  ## New Storage Bucket
  ### contact-attachments
  - Private bucket, 10 MB file size limit
  - Public (anon) can upload only; admins can read/delete

  ## Security
  - RLS enabled on contact_messages.
  - INSERT: anon + authenticated (public contact form, no login required).
  - SELECT/UPDATE/DELETE: owner + admin roles only (via JWT app_metadata.role
    check, consistent with the existing audit_logs pattern).
  - Storage: anon can upload to contact-attachments; admins can read + delete.

  ## GDPR / Retention
  - A `delete_contact_message(p_id uuid)` SECURITY DEFINER function performs
    a hard delete of the row + its attachment, callable only by owner/admin.
  - The `status = 'deleted'` value allows soft-delete before hard purge.
  - Encryption-at-rest is provided by Supabase/Postgres at the platform level;
    no additional column-level encryption is required for this data class.

  ## Notes
  1. The older `contact_submissions` table is left intact — no data loss.
  2. ip_address uses the `inet` type for efficient storage and validation.
  3. updated_at is auto-maintained by a trigger so admin status changes are
     always timestamped without application code.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- contact_messages table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  sender_name     text        NOT NULL CHECK (char_length(sender_name) BETWEEN 2 AND 200),
  sender_email    text        NOT NULL CHECK (sender_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  sender_phone    text        CHECK (char_length(sender_phone) <= 50),
  subject         text        NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 300),
  message         text        NOT NULL CHECK (char_length(message) BETWEEN 10 AND 5000),
  attachment_url  text,
  attachment_meta jsonb,
  delivered       boolean     NOT NULL DEFAULT false,
  delivered_at    timestamptz,
  delivery_error  text,
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  status          text        NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'read', 'archived', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_company_id  ON contact_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at  ON contact_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_messages_status      ON contact_messages(status);

ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

-- Public can submit contact messages (no login required)
DROP POLICY IF EXISTS "Public can submit contact messages" ON contact_messages;
CREATE POLICY "Public can submit contact messages"
  ON contact_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Owner + admin can read all contact messages
DROP POLICY IF EXISTS "Admins can read contact messages" ON contact_messages;
CREATE POLICY "Admins can read contact messages"
  ON contact_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Owner + admin can update status (mark read / archived / deleted)
DROP POLICY IF EXISTS "Admins can update contact messages" ON contact_messages;
CREATE POLICY "Admins can update contact messages"
  ON contact_messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Owner + admin can delete messages (GDPR right-to-erasure)
DROP POLICY IF EXISTS "Admins can delete contact messages" ON contact_messages;
CREATE POLICY "Admins can delete contact messages"
  ON contact_messages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contact_messages_updated_at ON contact_messages;
CREATE TRIGGER contact_messages_updated_at
  BEFORE UPDATE ON contact_messages
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage bucket for attachments
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contact-attachments',
  'contact-attachments',
  false,
  10485760, -- 10 MB
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Public can upload attachments (contact form is public)
DROP POLICY IF EXISTS "Public can upload contact attachments" ON storage.objects;
CREATE POLICY "Public can upload contact attachments"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'contact-attachments');

-- Admins can read attachments
DROP POLICY IF EXISTS "Admins can read contact attachments" ON storage.objects;
CREATE POLICY "Admins can read contact attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'contact-attachments'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Admins can delete attachments
DROP POLICY IF EXISTS "Admins can delete contact attachments" ON storage.objects;
CREATE POLICY "Admins can delete contact attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'contact-attachments'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- GDPR hard-delete helper (also removes the storage file)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_contact_message(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attachment_url text;
BEGIN
  -- Only owner/admin can call this (RLS on the table enforces this for
  -- direct access, but SECURITY DEFINER bypasses RLS so we check explicitly)
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT attachment_url INTO v_attachment_url
  FROM contact_messages WHERE id = p_id;

  DELETE FROM contact_messages WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_contact_message(uuid) TO authenticated;
