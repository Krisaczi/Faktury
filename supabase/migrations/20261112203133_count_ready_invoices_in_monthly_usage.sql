/*
# Count ready-for-KSeF invoices toward the monthly invoice limit

1. Changes
- `get_monthly_invoice_usage` now counts invoices with status `issued` OR `ready_for_ksef`.
- An invoice that passes validation moves to `ready_for_ksef` and consumes a monthly slot, exactly as `issued` did before.

2. Security
- Function signature, SECURITY DEFINER setting, search path and existing grants are unchanged.

3. Notes
- Only the status filter changes. Idempotent: safe to re-run.
*/

CREATE OR REPLACE FUNCTION public.get_monthly_invoice_usage(p_company_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT json_build_object(
'issued_count', (
SELECT count(*)::int
FROM issued_invoices
WHERE company_id = p_company_id
AND status IN ('issued', 'ready_for_ksef')
AND created_at >= date_trunc('month', now())
AND created_at < date_trunc('month', now() + interval '1 month')
),
'override_extra', COALESCE((
SELECT sum(extra_invoices)::int
FROM invoice_usage_overrides
WHERE company_id = p_company_id
AND active = true
AND (expires_at IS NULL OR expires_at > now())
AND created_at >= date_trunc('month', now())
), 0),
'override_consumed', COALESCE((
SELECT sum(consumed)::int
FROM invoice_usage_overrides
WHERE company_id = p_company_id
AND active = true
AND (expires_at IS NULL OR expires_at > now())
AND created_at >= date_trunc('month', now())
), 0),
'period_start', date_trunc('month', now()),
'period_end', date_trunc('month', now() + interval '1 month')
);
$function$;
