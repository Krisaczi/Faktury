/*
# Add company logo storage

1. Modified Tables
- `companies`: new nullable column `logo_path` (text) that stores the storage path of the company logo, for example `<company_id>/logo.png`.

2. New Storage
- Private bucket `company-logos`, limited to 2 MB and to PNG, JPEG and WebP images.

3. Security
- Objects are stored under a folder named after the company id.
- Company members can read logos in their own company folder.
- Only the owner of the company can upload, replace or delete logos in that folder.
- The bucket is private, so logos are only reachable through authenticated requests.

4. Notes
- Idempotent: safe to re-run.
- No existing data is modified or removed.
*/

ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  false,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "company_logos_select_members" ON storage.objects;
CREATE POLICY "company_logos_select_members" ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (
    SELECT u.company_id::text FROM users u WHERE u.id = auth.uid()
  )
);

DROP POLICY IF EXISTS "company_logos_insert_owner" ON storage.objects;
CREATE POLICY "company_logos_insert_owner" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (
    SELECT u.company_id::text FROM users u WHERE u.id = auth.uid() AND u.role = 'owner'
  )
);

DROP POLICY IF EXISTS "company_logos_update_owner" ON storage.objects;
CREATE POLICY "company_logos_update_owner" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (
    SELECT u.company_id::text FROM users u WHERE u.id = auth.uid() AND u.role = 'owner'
  )
)
WITH CHECK (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (
    SELECT u.company_id::text FROM users u WHERE u.id = auth.uid() AND u.role = 'owner'
  )
);

DROP POLICY IF EXISTS "company_logos_delete_owner" ON storage.objects;
CREATE POLICY "company_logos_delete_owner" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (
    SELECT u.company_id::text FROM users u WHERE u.id = auth.uid() AND u.role = 'owner'
  )
);
