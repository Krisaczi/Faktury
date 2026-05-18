/*
  # Back-fill invoice vendor_id using seller_nip

  ## Summary
  Some invoices were imported with seller_nip populated but vendor_id left NULL,
  because the vendor record was created in a separate import pass. This migration
  links those invoices to their existing vendor by matching seller_nip within the
  same company.

  ## Changes
  - UPDATE invoices: set vendor_id from vendors where seller_nip matches and vendor_id is currently NULL
*/

UPDATE invoices i
SET vendor_id = v.id
FROM vendors v
WHERE i.vendor_id IS NULL
  AND i.seller_nip IS NOT NULL
  AND i.seller_nip <> ''
  AND v.nip = i.seller_nip
  AND v.company_id = i.company_id;
