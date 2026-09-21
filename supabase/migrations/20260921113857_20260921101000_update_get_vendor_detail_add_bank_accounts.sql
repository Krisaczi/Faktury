/*
# Update get_vendor_detail RPC to include structured bank accounts

1. Changes
   - Drop and recreate get_vendor_detail to return a new `bank_accounts` column
   - The new column is a JSON array of objects: { id, bank_account_number, bank_name, source, created_at }
   - Reads from the vendor_bank_accounts table created in the previous migration
2. Security
   - Function remains SECURITY DEFINER, scoped to user's company via get_user_company_id()
3. Notes
   - The vendor JSON object no longer includes the legacy `bank_accounts` text array
   - The new top-level `bank_accounts` column provides structured data for the UI
*/

DROP FUNCTION IF EXISTS public.get_vendor_detail(uuid);

CREATE FUNCTION public.get_vendor_detail(p_vendor_id uuid)
RETURNS TABLE (
  vendor jsonb,
  stats jsonb,
  last_activity jsonb,
  bank_accounts jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := get_user_company_id();
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    jsonb_build_object(
      'id',            v.id,
      'name',          v.name,
      'category',      v.category,
      'risk_score',    v.risk_score,
      'status',        v.status,
      'contact_email', v.contact_email,
      'nip',           v.nip,
      'bank_accounts', v.bank_accounts,
      'bank_account_number', v.bank_account_number,
      'address_street',v.address_street,
      'address_zip',   v.address_zip,
      'address_city',  v.address_city,
      'notes',         v.notes,
      'new_vendor',    v.new_vendor,
      'created_at',    v.created_at
    ) AS vendor,

    COALESCE(
      (
        SELECT jsonb_build_object(
          'total_invoices',   count(*),
          'total_amount',     COALESCE(sum(i.total_amount), 0),
          'avg_amount',       COALESCE(avg(i.total_amount), 0),
          'high_risk_count',  count(*) FILTER (WHERE i.overall_risk IN ('high', 'critical')),
          'flagged_count',    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM risk_flags rf WHERE rf.invoice_id = i.id)),
          'open_flags_count', count(*) FILTER (WHERE EXISTS (SELECT 1 FROM risk_flags rf WHERE rf.invoice_id = i.id AND rf.status = 'open'))
        )
        FROM invoices i
        WHERE i.vendor_id = v.id AND i.company_id = v_company_id
      ),
      jsonb_build_object(
        'total_invoices', 0, 'total_amount', 0, 'avg_amount', 0,
        'high_risk_count', 0, 'flagged_count', 0, 'open_flags_count', 0
      )
    ) AS stats,

    COALESCE(
      (
        SELECT jsonb_build_object(
          'last_invoice_date',    max(i.issue_date),
          'last_invoice_id',      (array_agg(i.id ORDER BY i.created_at DESC))[1],
          'last_invoice_number',  (array_agg(i.invoice_number ORDER BY i.created_at DESC))[1]
        )
        FROM invoices i
        WHERE i.vendor_id = v.id AND i.company_id = v_company_id
      ),
      jsonb_build_object(
        'last_invoice_date', null, 'last_invoice_id', null, 'last_invoice_number', null
      )
    ) AS last_activity,

    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',                   vba.id,
            'bank_account_number',  vba.bank_account_number,
            'bank_name',            vba.bank_name,
            'source',               vba.source,
            'created_at',           vba.created_at
          )
          ORDER BY vba.created_at DESC
        )
        FROM vendor_bank_accounts vba
        WHERE vba.vendor_id = v.id
      ),
      '[]'::jsonb
    ) AS bank_accounts

  FROM vendors v
  WHERE v.id = p_vendor_id
    AND v.company_id = v_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vendor_detail(uuid) TO authenticated;