/*
  # Fix get_recent_activity RPC - correct risk_flags column name

  The function referenced rf.flag_type but the actual column is rf.type.
  This caused a 42703 (undefined column) error on every call.
*/

CREATE OR REPLACE FUNCTION get_recent_activity()
RETURNS TABLE (
  id         uuid,
  kind       text,
  label      text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := get_user_company_id();

  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  (
    SELECT
      i.id,
      'invoice'::text AS kind,
      ('Invoice ' || COALESCE(i.invoice_number, 'No number') || ' · ' || COALESCE(i.currency, 'PLN') || ' ' || COALESCE(i.total_amount::text, '0'))::text AS label,
      i.created_at
    FROM invoices i
    WHERE i.company_id = v_company_id
    ORDER BY i.created_at DESC
    LIMIT 5
  )
  UNION ALL
  (
    SELECT
      rf.id,
      'flag'::text AS kind,
      ('Risk flag: ' || COALESCE(rf.type, 'unknown') || ' on invoice ' || COALESCE(i.invoice_number, 'No number'))::text AS label,
      rf.created_at
    FROM risk_flags rf
    JOIN invoices i ON i.id = rf.invoice_id
    WHERE i.company_id = v_company_id
    ORDER BY rf.created_at DESC
    LIMIT 5
  )
  UNION ALL
  (
    SELECT
      us.id,
      'upload'::text AS kind,
      ('Upload session · ' || COALESCE(us.filename, us.source, 'manual') || ' (' || COALESCE(us.status, 'pending') || ')')::text AS label,
      us.created_at
    FROM upload_sessions us
    WHERE us.company_id = v_company_id
    ORDER BY us.created_at DESC
    LIMIT 5
  )
  ORDER BY created_at DESC
  LIMIT 10;
END;
$$;
