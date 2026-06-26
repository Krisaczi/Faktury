
-- Create vendors for each distinct (company_id, seller_nip) that has no vendor yet,
-- then link those invoices back to the new vendor rows.

DO $$
DECLARE
  r RECORD;
  v_id uuid;
  v_name text;
BEGIN
  FOR r IN
    SELECT DISTINCT i.seller_nip, i.company_id,
           u.id AS user_id
    FROM invoices i
    JOIN users u ON u.company_id = i.company_id
    WHERE i.seller_nip IS NOT NULL
      AND i.vendor_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM vendors v
        WHERE v.company_id = i.company_id AND v.nip = i.seller_nip
      )
    LIMIT 1 -- one user per company is enough
  LOOP
    -- Pick the most descriptive name from existing invoices for this NIP
    SELECT COALESCE(
      (SELECT name FROM vendors WHERE company_id = r.company_id AND nip = r.seller_nip LIMIT 1),
      r.seller_nip
    ) INTO v_name;

    INSERT INTO vendors (company_id, user_id, name, nip, status, new_vendor)
    VALUES (r.company_id, r.user_id, v_name, r.seller_nip, 'active', true)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    -- If ON CONFLICT fired, look up the existing row
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM vendors
      WHERE company_id = r.company_id AND nip = r.seller_nip;
    END IF;

    -- Link all invoices for this company+nip
    IF v_id IS NOT NULL THEN
      UPDATE invoices
      SET vendor_id = v_id
      WHERE company_id = r.company_id
        AND seller_nip = r.seller_nip
        AND vendor_id IS NULL;
    END IF;
  END LOOP;
END $$;
