/*
# Remove 7-day free trial system

## Summary
Removes all trial-related database infrastructure: the `trial_active` and
`trial_expires_at` columns from `companies`, and the `trial_notifications`
table used by the trial cron job. Any company currently on `subscription_status
= 'trial'` is migrated to `'active'` so they retain full access.

## Changes

1. **Data migration**
   - Update `companies.subscription_status` from `'trial'` to `'active'` for
     any rows still marked as trial, so no company loses access.

2. **Column removals (companies)**
   - `trial_active` (boolean)
   - `trial_expires_at` (timestamptz)

3. **Table removal**
   - `trial_notifications` — dropped entirely (was only used by the trial cron
     endpoint for idempotent email sends; no other code references it).

## Security
- No new policies or RLS changes. Existing `companies` RLS policies are
  unaffected because they do not reference the dropped columns.

## Important notes
- This migration is irreversible (column drops). The data migration in step 1
  runs before the drops so no company is left in a broken state.
- The `billing_metadata` table may still contain a `trial_ends_at` column
  sourced from Lemon Squeezy webhooks — that is independent of the internal
  trial system and is NOT removed here.
*/

-- Step 1: Migrate any trial-status companies to active
UPDATE public.companies
SET subscription_status = 'active',
    updated_at          = now()
WHERE subscription_status = 'trial';

-- Step 2: Drop trial_notifications table
DROP TABLE IF EXISTS public.trial_notifications CASCADE;

-- Step 3: Remove trial columns from companies
ALTER TABLE public.companies
  DROP COLUMN IF EXISTS trial_active,
  DROP COLUMN IF EXISTS trial_expires_at;
