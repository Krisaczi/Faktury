INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices',
  'invoices',
  false,
  10485760,
  ARRAY['application/xml', 'text/xml', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;
