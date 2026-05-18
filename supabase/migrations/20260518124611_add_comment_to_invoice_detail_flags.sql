/*
  # Add comment field to flags in get_invoice_detail RPC

  The InvoiceFlag type in the frontend includes a `comment` field, but
  the get_invoice_detail RPC was not returning it. This caused undefined
  access errors when rendering the FlagCard component.
*/

CREATE OR REPLACE FUNCTION public.get_invoice_detail(p_invoice_id uuid)
 RETURNS TABLE(invoice jsonb, flags jsonb, reviews jsonb, vendor jsonb)
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
      'id',             i.id,
      'invoice_number', i.invoice_number,
      'invoice_date',   i.invoice_date,
      'issue_date',     i.issue_date,
      'due_date',       i.due_date,
      'amount',         COALESCE(i.total_amount, i.amount),
      'tax_amount',     i.tax_amount,
      'currency',       i.currency,
      'seller_nip',     i.seller_nip,
      'buyer_nip',      i.buyer_nip,
      'bank_account',   i.bank_account,
      'raw_file_url',   i.raw_file_url,
      'overall_risk',   i.overall_risk,
      'vendor_id',      i.vendor_id,
      'upload_session_id', i.upload_session_id,
      'created_at',     i.created_at
    ) AS invoice,

    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',               rf.id,
            'type',             rf.type,
            'severity',         rf.severity,
            'message',          rf.message,
            'status',           rf.status,
            'comment',          rf.comment,
            'acknowledged_by',  rf.acknowledged_by,
            'acknowledged_at',  rf.acknowledged_at,
            'created_at',       rf.created_at
          )
          ORDER BY
            CASE rf.severity
              WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
              WHEN 'low' THEN 3 ELSE 4
            END,
            rf.created_at
        )
        FROM risk_flags rf
        WHERE rf.invoice_id = i.id
      ),
      '[]'::jsonb
    ) AS flags,

    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',           ir.id,
            'status',       ir.status,
            'note',         ir.note,
            'reviewer_id',  ir.reviewer_id,
            'created_at',   ir.created_at
          )
          ORDER BY ir.created_at DESC
        )
        FROM invoice_reviews ir
        WHERE ir.invoice_id = i.id
      ),
      '[]'::jsonb
    ) AS reviews,

    CASE
      WHEN i.vendor_id IS NULL THEN NULL
      ELSE (
        SELECT jsonb_build_object(
          'id',           v.id,
          'name',         v.name,
          'category',     v.category,
          'risk_score',   v.risk_score,
          'status',       v.status,
          'contact_email',v.contact_email
        )
        FROM vendors v WHERE v.id = i.vendor_id
      )
    END AS vendor

  FROM invoices i
  WHERE i.id = p_invoice_id
    AND i.company_id = v_company_id;
END;
$function$;
