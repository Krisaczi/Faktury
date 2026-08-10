-- ════════════════════════════════════════════════════════════════════════════
-- Billing Upgrade — Diagnostic Queries & Remediation
-- ════════════════════════════════════════════════════════════════════════════
--
-- Run these in the Supabase SQL Editor to diagnose why
-- POST /api/billing/upgrade returns "Company not found" or 404.
--
-- These are read-only diagnostic queries (no mutations).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Find orphaned users (no company_id) ───────────────────────────────────
-- These users will trigger the "Company id missing in session" (400) response.
SELECT id, email, role, created_at
FROM public.users
WHERE company_id IS NULL
ORDER BY created_at DESC;

-- ─── 2. Find users whose company_id points to a non-existent company row ──────
-- These users will trigger the "Company not found" (404) response.
SELECT u.id AS user_id, u.email, u.role, u.company_id
FROM public.users u
LEFT JOIN public.companies c ON c.id = u.company_id
WHERE u.company_id IS NOT NULL AND c.id IS NULL;

-- ─── 3. Verify the user → company → package chain is intact ───────────────────
-- Shows the full chain for every user. Look for NULLs in any column.
SELECT
  u.id        AS user_id,
  u.email,
  u.role,
  u.company_id,
  c.name      AS company_name,
  c.product_type,
  c.package_type,
  c.subscription_status
FROM public.users u
LEFT JOIN public.companies c ON c.id = u.company_id
ORDER BY u.created_at DESC;

-- ─── 4. Check companies RLS policies (should allow member reads) ──────────────
SELECT polname, polcmd,
       pg_get_expr(polqual, polrelid)   AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE polrelid = 'public.companies'::regclass
ORDER BY polname;

-- ─── 5. Check users RLS policies ──────────────────────────────────────────────
SELECT polname, polcmd,
       pg_get_expr(polqual, polrelid)   AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE polrelid = 'public.users'::regclass
ORDER BY polname;

-- ─── 6. Check billing_audit RLS policies ──────────────────────────────────────
SELECT polname, polcmd,
       pg_get_expr(polqual, polrelid)   AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE polrelid = 'public.billing_audit'::regclass
ORDER BY polname;

-- ════════════════════════════════════════════════════════════════════════════
-- REMEDIATION SCRIPTS
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Review the output of queries 1 and 2 before running any remediation.
--    These scripts create missing company rows or reassign company_id.
--    Always back up before running.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Fix A: Create a company for an orphaned user (query 1 result) ────────────
-- Replace <USER_ID> with the actual user ID from query 1.
-- Only run this if the user should have their own company.
--
-- DO $$
-- DECLARE
--   v_user_id uuid := '<USER_ID>'::uuid;
--   v_new_company_id uuid;
-- BEGIN
--   -- Create the company
--   v_new_company_id := gen_random_uuid();
--   INSERT INTO public.companies (id, name, nip, currency, product_type, package_type, subscription_status)
--   VALUES (v_new_company_id, 'Nowa firma', '', 'PLN', 'starter', 'starter', 'active');
--
--   -- Link the user to it
--   UPDATE public.users SET company_id = v_new_company_id WHERE id = v_user_id;
-- END $$;

-- ─── Fix B: Reassign a user with a dangling company_id (query 2 result) ───────
-- Replace <USER_ID> with the actual user ID from query 2.
-- This sets company_id to NULL so onboarding can re-run.
--
-- UPDATE public.users SET company_id = NULL WHERE id = '<USER_ID>'::uuid;

-- ─── Fix C: Backfill missing company rows for users in query 2 ────────────────
-- If a user's company was accidentally deleted (FK cascade), recreate it.
-- Replace <USER_ID> and <COMPANY_ID> with actual values from query 2.
--
-- INSERT INTO public.companies (id, name, nip, currency, product_type, package_type, subscription_status)
-- VALUES ('<COMPANY_ID>'::uuid, 'Firma (odzyskana)', '', 'PLN', 'starter', 'starter', 'active')
-- ON CONFLICT (id) DO NOTHING;
