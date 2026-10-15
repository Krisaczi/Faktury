-- Grant service_role CRUD privileges on all tables the demo seeder needs.
-- The seeder uses a service-role Supabase client which bypasses RLS but
-- still requires explicit table-level GRANTs.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_flags    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_sessions TO service_role;

-- Also grant on sequences these tables may use (for gen_random_uuid etc.)
-- gen_random_uuid() is a built-in function, not a sequence, so no sequence grants needed.
