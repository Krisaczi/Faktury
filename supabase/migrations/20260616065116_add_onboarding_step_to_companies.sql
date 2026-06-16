-- Track onboarding progress so users can resume mid-flow.
-- NULL  = not started / legacy row
-- 'company_created' = step 1 done, awaiting product selection
-- 'product_selected' = fully onboarded
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS onboarding_step text
    CHECK (onboarding_step IN ('company_created', 'product_selected'));

-- Back-fill existing fully-onboarded companies
UPDATE public.companies
   SET onboarding_step = 'product_selected'
 WHERE product_type IS NOT NULL
   AND onboarding_step IS NULL;
