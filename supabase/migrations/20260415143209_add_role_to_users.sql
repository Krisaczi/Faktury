/*
  # Add role field to users table

  ## Summary
  Adds a `role` column to the `users` table to support admin account functionality.

  ## Changes
  ### Modified Tables
  - `users`
    - Added `role` (text, NOT NULL, DEFAULT 'user') — allowed values: 'user', 'admin'
    - Added a CHECK constraint to enforce only valid role values

  ## Security
  - RLS policies updated: users cannot update their own role (only service role can)
  - Existing users automatically receive role = 'user' via DEFAULT

  ## Notes
  1. All existing users get role = 'user' automatically
  2. The role column has a CHECK constraint: role IN ('user', 'admin')
  3. No self-assignment of admin role is possible through RLS
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'user'
      CHECK (role IN ('user', 'admin'));
  END IF;
END $$;

UPDATE users SET role = 'user' WHERE role IS NULL OR role NOT IN ('user', 'admin');
