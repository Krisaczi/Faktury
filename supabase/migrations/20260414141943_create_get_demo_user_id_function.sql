/*
  # Create get_demo_user_id helper function

  Returns the auth.users UUID for a given email address.
  Used by the demo-auth edge function to avoid the slow listUsers() API call.
*/

CREATE OR REPLACE FUNCTION get_demo_user_id(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id FROM auth.users WHERE email = p_email LIMIT 1;
$$;
