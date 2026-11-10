/*
# Enforce vendor plan limits in the database

## Summary

The vendor limit (25 vendors on Starter, unlimited on Professional) was only
checked in application code, so any signed-in user could insert more vendors
directly through the data API. This migration moves the limit into a database
trigger so it applies to every insert and every move of a vendor into a company.

## Changes

1. New function `enforce_vendor_plan_limit()`:
   - Skips the check for platform owners (owner accounts are exempt).
   - Resolves the company's active plan (plan_assignments, then companies).
   - Reads `max_vendors_contractors` from `pricing_tiers`. If no tier row exists,
     falls back to 25 for non-Professional plans, matching the app's fallback.
   - Takes a per-company transaction lock so concurrent inserts cannot both
     pass the count check.
   - Counts the company's existing vendors and raises `PLAN_VENDOR_LIMIT_REACHED`
     when the limit is reached.
2. New trigger `vendors_enforce_plan_limit` on `vendors` (BEFORE INSERT, and
   BEFORE UPDATE when `company_id` changes).

## Security

- The function runs as SECURITY DEFINER so the count is not hidden by row
  level security. Its search path is fixed to `public`.
- EXECUTE is revoked from PUBLIC, anon and authenticated. Triggers still fire.
- No tables, columns or existing policies are changed. No data is modified.

## Notes

- Existing vendors above the limit are kept. Only new inserts or company moves
  are blocked.
- The check is skipped when a vendor has no company; those vendors are counted
  per user against the Starter limit.
*/

CREATE OR REPLACE FUNCTION public.enforce_vendor_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := NEW.company_id;
  v_plan    text;
  v_limit   integer;
  v_count   integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id THEN
    RETURN NEW;
  END IF;

  IF public.is_caller_owner() THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(COALESCE(v_company::text, NEW.user_id::text), 0)
  );

  IF v_company IS NOT NULL THEN
    v_plan := COALESCE(
      (SELECT pa.plan_id FROM public.plan_assignments pa
        WHERE pa.entity_type = 'company'
          AND pa.entity_id = v_company
          AND pa.status = 'active'
        LIMIT 1),
      (SELECT COALESCE(c.product_type, c.package_type) FROM public.companies c
        WHERE c.id = v_company),
      'starter'
    );
  ELSE
    v_plan := 'starter';
  END IF;

  SELECT pt.max_vendors_contractors INTO v_limit
    FROM public.pricing_tiers pt
   WHERE pt.plan_id = v_plan;

  IF NOT FOUND THEN
    v_limit := CASE WHEN v_plan = 'professional' THEN NULL ELSE 25 END;
  END IF;

  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.vendors v
   WHERE v.id <> NEW.id
     AND (
       (v_company IS NOT NULL AND v.company_id = v_company)
       OR (v_company IS NULL AND v.user_id = NEW.user_id)
     );

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_VENDOR_LIMIT_REACHED'
      USING ERRCODE = 'P0001',
            HINT = 'Vendor limit reached for the current plan';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_vendor_plan_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vendors_enforce_plan_limit ON public.vendors;

CREATE TRIGGER vendors_enforce_plan_limit
  BEFORE INSERT OR UPDATE OF company_id ON public.vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_vendor_plan_limit();
