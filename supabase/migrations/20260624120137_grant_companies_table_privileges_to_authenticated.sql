-- Grant table-level privileges to authenticated and anon roles on companies.
-- Without these, RLS policies are never even evaluated — Postgres returns
-- "permission denied" before checking any policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT SELECT ON public.companies TO anon;
