/*
# Fix professional tier features — missing reports_per_month

## Problem
The `pricing_tiers` row for the "professional" plan has a `features` JSON that
is missing `reports_per_month`. When the code checks
`features.reports_per_month === null`, it gets `undefined` instead, which is
not equal to `null`. This causes the report limit check to fail, blocking
Professional users from loading the risk report page.

## Fix
Update the professional tier's `features` JSON to explicitly include all
fields that the code expects, with `null` for unlimited values.
*/

UPDATE public.pricing_tiers
SET features = jsonb_build_object(
  'invoicing',          true,
  'users_limit',        3,
  'vendors_limit',      NULL,
  'invoices_per_month', NULL,
  'reports_per_month',  NULL,
  'file_uploads',       true,
  'support',            'priority'
),
updated_at = now()
WHERE key = 'professional';
