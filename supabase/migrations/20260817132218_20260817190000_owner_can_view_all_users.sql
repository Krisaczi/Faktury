/*
# Owner can read ALL users (platform-wide)
# The existing RLS policy only lets users see members of their own company.
# The platform owner needs to see every registered user for the Users admin page.
*/

CREATE POLICY "Owner can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (is_caller_owner());
