/*
  # Add is_demo flag to users table

  ## Summary
  Adds an `is_demo` boolean column to the `users` table so demo mode can be
  tracked per-user (in addition to the per-company `companies.is_demo` flag).
  This lets the system quickly determine demo status from the user row without
  a join, and supports the `enterDemoMode` / `exitDemoMode` server actions.

  ## Changes
  - `users.is_demo` (boolean, default false) — marks a user as operating in demo mode
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_demo'
  ) THEN
    ALTER TABLE users ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
  END IF;
END $$;
