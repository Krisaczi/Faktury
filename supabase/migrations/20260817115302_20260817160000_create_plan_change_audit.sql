/*
# Plan change audit log for admin plan management

## Purpose
Tracks every plan change made by platform owners: who changed, which user,
from/to which plan, effective timing, reason, and notes.

## Rollback
  DROP TABLE IF EXISTS plan_change_audit;
*/

CREATE TABLE IF NOT EXISTS plan_change_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id      uuid REFERENCES companies(id) ON DELETE SET NULL,
  from_plan       text NOT NULL,
  to_plan         text NOT NULL,
  effective       text NOT NULL DEFAULT 'now' CHECK (effective IN ('now', 'period_end')),
  reason          text,
  notes           text,
  admin_ip        inet,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE plan_change_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_plan_change_audit_owner"
  ON plan_change_audit FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'owner'
  ));

CREATE POLICY "insert_plan_change_audit_owner"
  ON plan_change_audit FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'owner'
  ));

CREATE INDEX idx_plan_change_audit_target ON plan_change_audit(target_user_id, created_at DESC);
CREATE INDEX idx_plan_change_audit_company ON plan_change_audit(company_id, created_at DESC);
