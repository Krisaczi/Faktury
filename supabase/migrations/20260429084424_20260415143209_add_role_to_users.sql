/*
  # Add role field to users table (admin support)

  Adds role column with admin/user constraint if not already present with correct values.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
      AND column_default = '''user''::text'
  ) THEN
    ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';
  END IF;
END $$;

UPDATE users SET role = 'user' WHERE role IS NULL OR role NOT IN ('user', 'admin');
