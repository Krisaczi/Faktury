-- ──────────────────────────────────────────────────────────────────────────────
-- Audit script: Compare total users vs users visible to owner
--
-- Run this to verify the owner can see all registered users.
-- If "visible_to_owner" < "total_users", there is an RLS or query filter bug.
--
-- Usage (via Supabase MCP execute_sql):
--   See docs/audit-users-visibility.sql
-- ──────────────────────────────────────────────────────────────────────────────

SELECT
  (SELECT count(*) FROM users)                                          AS total_users,
  (SELECT count(*) FROM users WHERE role = 'owner')                     AS owner_count,
  (SELECT count(*) FROM users WHERE active = true)                      AS active_users,
  (SELECT count(*) FROM users WHERE active = false)                     AS inactive_users,
  (SELECT count(DISTINCT company_id) FROM users
     WHERE company_id IS NOT NULL)                                      AS companies_with_users,
  (SELECT count(*) FROM users
     WHERE company_id IS NULL)                                          AS users_without_company;

-- Per-company breakdown
SELECT
  c.name        AS company_name,
  count(u.id)   AS user_count,
  count(u.id) FILTER (WHERE u.role = 'owner')      AS owners,
  count(u.id) FILTER (WHERE u.role = 'accountant') AS accountants,
  count(u.id) FILTER (WHERE u.active = false)      AS inactive
FROM users u
LEFT JOIN companies c ON c.id = u.company_id
GROUP BY c.name
ORDER BY user_count DESC;

-- Users that would be HIDDEN by the old company_id filter
-- (these are users NOT in the owner's company)
SELECT
  u.id,
  u.email,
  u.role,
  u.active,
  c.name AS company_name
FROM users u
LEFT JOIN companies c ON c.id = u.company_id
WHERE u.company_id != (
  SELECT company_id FROM users WHERE role = 'owner' LIMIT 1
)
ORDER BY u.created_at DESC;
