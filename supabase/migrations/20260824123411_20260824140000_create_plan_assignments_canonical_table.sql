/*
# Create plan_assignments canonical table

## Purpose
Creates a single authoritative table `plan_assignments` that stores the
canonical plan for each company. This replaces reading plan state from
multiple derived columns (companies.product_type, companies.package_type)
which can drift out of sync.

## New Tables
- `plan_assignments`
  - `id` (uuid, primary key)
  - `entity_id` (uuid, references companies.id, NOT NULL)
  - `entity_type` (text, default 'company')
  - `plan_id` (text, NOT NULL — e.g. 'starter', 'professional')
  - `status` (text, default 'active' — 'active' | 'inactive')
  - `effective_from` (timestamptz, default now())
  - `effective_until` (timestamptz, nullable)
  - `metadata` (jsonb, default '{}')
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())
  - Unique constraint on (entity_id, entity_type) where status = 'active'

## Security
- RLS enabled
- Authenticated users can read their own company's assignment
- Only owner role can read all assignments, insert, update, delete
- Uses company membership check via users table

## Backfill
- After creation, all existing companies get an active assignment
  based on their current companies.product_type value

## Notes
- public.pricing_tiers is NOT modified (read-only)
- companies.product_type is kept in sync as a derived field
- plan_change_audit table already exists for audit logging
*/

-- ─── 1. Create plan_assignments table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type    text NOT NULL DEFAULT 'company',
  plan_id        text NOT NULL,
  status         text NOT NULL DEFAULT 'active',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Unique index: one active assignment per entity ─────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS plan_assignments_active_unique
  ON plan_assignments (entity_id, entity_type)
  WHERE status = 'active';

-- ─── 3. Index for lookups by entity_id ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS plan_assignments_entity_idx
  ON plan_assignments (entity_id);

-- ─── 4. Enable RLS ─────────────────────────────────────────────────────────────
ALTER TABLE plan_assignments ENABLE ROW LEVEL SECURITY;

-- ─── 5. RLS Policies ───────────────────────────────────────────────────────────

-- SELECT: users can read their own company's assignment; owner can read all
DROP POLICY IF EXISTS "select_plan_assignments" ON plan_assignments;
CREATE POLICY "select_plan_assignments"
  ON plan_assignments FOR SELECT
  TO authenticated
  USING (
    entity_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- INSERT: owner only
DROP POLICY IF EXISTS "insert_plan_assignments" ON plan_assignments;
CREATE POLICY "insert_plan_assignments"
  ON plan_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- UPDATE: owner only
DROP POLICY IF EXISTS "update_plan_assignments" ON plan_assignments;
CREATE POLICY "update_plan_assignments"
  ON plan_assignments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- DELETE: owner only
DROP POLICY IF EXISTS "delete_plan_assignments" ON plan_assignments;
CREATE POLICY "delete_plan_assignments"
  ON plan_assignments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- ─── 6. Backfill: create active assignments for all existing companies ─────────
INSERT INTO plan_assignments (entity_id, entity_type, plan_id, status, effective_from, metadata)
SELECT
  c.id,
  'company',
  COALESCE(c.product_type, c.package_type, 'starter'),
  'active',
  COALESCE(c.package_assigned_at, c.updated_at, now()),
  jsonb_build_object('source', 'backfill', 'original_product_type', c.product_type)
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM plan_assignments pa
  WHERE pa.entity_id = c.id
    AND pa.entity_type = 'company'
    AND pa.status = 'active'
)
ON CONFLICT DO NOTHING;

-- ─── 7. Grant privileges ──────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON plan_assignments TO authenticated;
