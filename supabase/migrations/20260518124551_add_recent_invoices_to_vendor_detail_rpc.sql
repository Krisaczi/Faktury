/*
  # Add recent_invoices to get_vendor_detail RPC

  The invoice detail page uses the vendor summary hook which calls get_vendor_detail.
  VendorSummaryCard expects a `recent_invoices` array in the response, but the RPC
  didn't include it, causing a runtime crash on `.length`.

  Must DROP and recreate because the return type changes (new column added).
*/

DROP FUNCTION IF EXISTS public.get_vendor_detail(uuid);

CREATE OR REPLACE FUNCTION public.get_vendor_detail(p_vendor_id uuid)
 RETURNS TABLE(vendor jsonb, stats jsonb, last_activity jsonb, recent_invoices jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'nip',           v.nip,
      'category',      v.category,
      'risk_score',    v.risk_score,
      'status',        v.status,
      'contact_email', v.contact_email,
      'bank_accounts', to_jsonb(COALESCE(v.bank_accounts, '{}'::text[])),
      'notes',         v.notes,
      'created_at',    v.created_at,
      'updated_at',    v.updated_at,
      'new_vendor',    v.new_vendor
    ) AS vendor,

    (
      SELECT jsonb_build_object(
        'total_invoices',     COUNT(*),
        'total_amount',       COALESCE(SUM(COALESCE(i2.total_amount, i2.amount)), 0),
        'avg_amount',         COALESCE(AVG(COALESCE(i2.total_amount, i2.amount)), 0),
        'high_risk_count',    COUNT(*) FILTER (WHERE i2.overall_risk IN ('high','critical')),
        'flagged_count',      COUNT(DISTINCT i2.id) FILTER (
          WHERE EXISTS (SELECT 1 FROM risk_flags rf WHERE rf.invoice_id = i2.id)
        ),
        'open_flags_count',   (
          SELECT COUNT(*) FROM risk_flags rf2
          WHERE rf2.invoice_id IN (
            SELECT id FROM invoices WHERE vendor_id = p_vendor_id AND company_id = v_company_id
          ) AND rf2.status = 'open'
        )
      )
      FROM invoices i2
      WHERE i2.vendor_id = p_vendor_id
        AND i2.company_id = v_company_id
    ) AS stats,

    (
      SELECT jsonb_build_object(
        'last_invoice_date', MAX(i3.issue_date),
        'last_invoice_id',   (
          SELECT id FROM invoices
          WHERE vendor_id = p_vendor_id AND company_id = v_company_id
          ORDER BY created_at DESC NULLS LAST LIMIT 1
        ),
        'last_invoice_number', (
          SELECT invoice_number FROM invoices
          WHERE vendor_id = p_vendor_id AND company_id = v_company_id
          ORDER BY created_at DESC NULLS LAST LIMIT 1
        )
      )
      FROM invoices i3
      WHERE i3.vendor_id = p_vendor_id
        AND i3.company_id = v_company_id
    ) AS last_activity,

    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',             i4.id,
            'invoice_number', i4.invoice_number,
            'issue_date',     i4.issue_date,
            'amount',         COALESCE(i4.total_amount, i4.amount),
            'currency',       i4.currency,
            'overall_risk',   i4.overall_risk
          )
          ORDER BY i4.created_at DESC NULLS LAST
        )
        FROM (
          SELECT id, invoice_number, issue_date, total_amount, amount, currency, overall_risk, created_at
          FROM invoices
          WHERE vendor_id = p_vendor_id AND company_id = v_company_id
          ORDER BY created_at DESC NULLS LAST
          LIMIT 5
        ) i4
      ),
      '[]'::jsonb
    ) AS recent_invoices

  FROM vendors v
  WHERE v.id = p_vendor_id;
END;
$function$;
