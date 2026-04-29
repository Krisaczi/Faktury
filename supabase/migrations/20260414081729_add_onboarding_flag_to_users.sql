/*
  # Add onboarding tracking to users table

  ## Summary
  Adds an `onboarded` boolean column to the `users` table so the middleware and
  server components can quickly determine whether a user has completed the company
  setup wizard without querying the `companies` table on every request.

  The column defaults to `false` so all existing rows remain un-onboarded until
  explicitly set to `true` after the company creation step.

  ## Changes
  - `users.onboarded` (boolean, default false) — set to true after /onboarding completes
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'onboarded'
  ) THEN
    ALTER TABLE users ADD COLUMN onboarded boolean DEFAULT false;
  END IF;
END $$;
