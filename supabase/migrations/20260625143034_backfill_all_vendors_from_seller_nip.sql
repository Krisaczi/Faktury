
-- Backfill: create a vendor row for every distinct (company_id, seller_nip)
-- that doesn't have one yet, then link invoices to the new vendor.

DO $$
DECLARE
  r RECORD;
  v_id uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (i.company_id, i.seller_nip)
           i.seller_nip,
           i.company_id,
           u.id AS user_id
    FROM invoices i
    JOIN users u ON u.company_id = i.company_id
    WHERE i.seller_nip IS NOT NULL
      AND i.vendor_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM vendors v
        WHERE v.company_id = i.company_id AND v.nip = i.seller_nip
      )
  LOOP
    INSERT INTO vendors (company_id, user_id, name, nip, status, new_vendor)
    VALUES (r.company_id, r.user_id, r.seller_nip, r.seller_nip, 'active', true)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM vendors
      WHERE company_id = r.company_id AND nip = r.seller_nip;
    END IF;

    IF v_id IS NOT NULL THEN
      UPDATE invoices
      SET vendor_id = v_id
      WHERE company_id = r.company_id
        AND seller_nip = r.seller_nip
        AND vendor_id IS NULL;
    END IF;
  END LOOP;
END $$;
