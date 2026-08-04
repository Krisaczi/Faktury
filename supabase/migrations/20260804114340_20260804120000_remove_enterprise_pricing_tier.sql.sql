-- Remove the "Enterprise" pricing tier.
-- The application already only supports Starter and Professional:
--   - companies.product_type has a CHECK constraint limiting to ('starter', 'professional')
--   - No companies have product_type = 'enterprise' or package_type = 'enterprise'
--   - All application code (selectProduct, getCompanyCard, onboarding) only uses these two tiers
-- This migration deletes the orphaned Enterprise row from pricing_tiers.

DELETE FROM public.pricing_tiers WHERE name = 'Enterprise';
