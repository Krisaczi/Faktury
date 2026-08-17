/*
# Rename admin_id → owner_id in plan_change_audit
# Aligns naming with owner-only authorization model.
*/

ALTER TABLE plan_change_audit RENAME COLUMN admin_id TO owner_id;
ALTER TABLE plan_change_audit RENAME COLUMN admin_ip TO owner_ip;
ALTER TABLE plan_change_audit RENAME CONSTRAINT plan_change_audit_admin_id_fkey TO plan_change_audit_owner_id_fkey;

CREATE INDEX IF NOT EXISTS idx_plan_change_audit_owner ON plan_change_audit(owner_id, created_at DESC);
