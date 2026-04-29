/*
  # Create demo seed function

  ## Summary
  Creates a PostgreSQL function `seed_demo_data(company_id uuid)` that populates
  a demo company with realistic sample vendors, invoices (with raw XML), and risk
  flags. This function is idempotent — calling it again will upsert without
  duplicating rows.

  ## Details
  - Inserts 5 sample `company_vendors` rows with Polish NIPs and bank accounts
  - Inserts 12 sample `company_invoices` rows spread over the last 30 days,
    covering low / medium / high risk classifications and minimal valid KSeF XML
  - Clears existing demo data first so re-seeding is safe
*/

CREATE OR REPLACE FUNCTION seed_demo_data(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v1 uuid := gen_random_uuid();
  v2 uuid := gen_random_uuid();
  v3 uuid := gen_random_uuid();
  v4 uuid := gen_random_uuid();
  v5 uuid := gen_random_uuid();
BEGIN
  -- Clear existing demo vendors & invoices for this company
  DELETE FROM company_invoices WHERE company_id = p_company_id;
  DELETE FROM company_vendors  WHERE company_id = p_company_id;

  -- ── Vendors ──────────────────────────────────────────────────────────────
  INSERT INTO company_vendors (id, company_id, name, nip, bank_accounts, avg_amount) VALUES
    (v1, p_company_id, 'Technika Polska Sp. z o.o.',  '5213012345', ARRAY['PL61109010140000071219812874'], 12400.00),
    (v2, p_company_id, 'Usługi Budowlane Kowalski',   '7271234567', ARRAY['PL27114020040000320200000000'], 8750.50),
    (v3, p_company_id, 'Fast Logistics S.A.',          '1132345678', ARRAY['PL82175000090000000200987654'], 3200.00),
    (v4, p_company_id, 'Media & Marketing Group',      '9191234567', ARRAY['PL44109024027777777700000000', 'PL61109010140000071219812875'], 6800.00),
    (v5, p_company_id, 'Energia Odnawialna Sp. k.',    '6572345678', ARRAY['PL73116022020000000219326600'], 21000.00);

  -- ── Invoices ─────────────────────────────────────────────────────────────
  -- Low risk invoices
  INSERT INTO company_invoices
    (id, company_id, vendor_id, ksef_reference, invoice_number, amount, currency,
     issue_date, due_date, bank_account, overall_risk, seller_nip, buyer_nip, seller_name, xml_raw)
  VALUES
    (gen_random_uuid(), p_company_id, v1,
     'KSeF/2026/0001/DEMO', 'FV/2026/03/001', 12400.00, 'PLN',
     (CURRENT_DATE - INTERVAL '28 days')::text, (CURRENT_DATE - INTERVAL '14 days')::text,
     'PL61109010140000071219812874', 'low',
     '5213012345', '0000000000', 'Technika Polska Sp. z o.o.',
     '<?xml version="1.0" encoding="UTF-8"?><KSeF><Invoice><Header><InvoiceNumber>FV/2026/03/001</InvoiceNumber><IssueDate>' || (CURRENT_DATE - INTERVAL '28 days')::text || '</IssueDate></Header><Seller><NIP>5213012345</NIP><Name>Technika Polska Sp. z o.o.</Name></Seller><Buyer><NIP>0000000000</NIP></Buyer><Total><Amount>12400.00</Amount><Currency>PLN</Currency></Total></Invoice></KSeF>'),

    (gen_random_uuid(), p_company_id, v1,
     'KSeF/2026/0002/DEMO', 'FV/2026/03/002', 9800.00, 'PLN',
     (CURRENT_DATE - INTERVAL '21 days')::text, (CURRENT_DATE - INTERVAL '7 days')::text,
     'PL61109010140000071219812874', 'low',
     '5213012345', '0000000000', 'Technika Polska Sp. z o.o.',
     '<?xml version="1.0" encoding="UTF-8"?><KSeF><Invoice><Header><InvoiceNumber>FV/2026/03/002</InvoiceNumber><IssueDate>' || (CURRENT_DATE - INTERVAL '21 days')::text || '</IssueDate></Header><Seller><NIP>5213012345</NIP><Name>Technika Polska Sp. z o.o.</Name></Seller><Buyer><NIP>0000000000</NIP></Buyer><Total><Amount>9800.00</Amount><Currency>PLN</Currency></Total></Invoice></KSeF>'),

    (gen_random_uuid(), p_company_id, v3,
     'KSeF/2026/0003/DEMO', 'FV/2026/03/003', 3200.00, 'PLN',
     (CURRENT_DATE - INTERVAL '18 days')::text, (CURRENT_DATE - INTERVAL '4 days')::text,
     'PL82175000090000000200987654', 'low',
     '1132345678', '0000000000', 'Fast Logistics S.A.',
     '<?xml version="1.0" encoding="UTF-8"?><KSeF><Invoice><Header><InvoiceNumber>FV/2026/03/003</InvoiceNumber><IssueDate>' || (CURRENT_DATE - INTERVAL '18 days')::text || '</IssueDate></Header><Seller><NIP>1132345678</NIP><Name>Fast Logistics S.A.</Name></Seller><Buyer><NIP>0000000000</NIP></Buyer><Total><Amount>3200.00</Amount><Currency>PLN</Currency></Total></Invoice></KSeF>'),

    (gen_random_uuid(), p_company_id, v3,
     'KSeF/2026/0004/DEMO', 'FV/2026/03/004', 4100.00, 'PLN',
     (CURRENT_DATE - INTERVAL '10 days')::text, (CURRENT_DATE + INTERVAL '4 days')::text,
     'PL82175000090000000200987654', 'low',
     '1132345678', '0000000000', 'Fast Logistics S.A.',
     '<?xml version="1.0" encoding="UTF-8"?><KSeF><Invoice><Header><InvoiceNumber>FV/2026/03/004</InvoiceNumber><IssueDate>' || (CURRENT_DATE - INTERVAL '10 days')::text || '</IssueDate></Header><Seller><NIP>1132345678</NIP><Name>Fast Logistics S.A.</Name></Seller><Buyer><NIP>0000000000</NIP></Buyer><Total><Amount>4100.00</Amount><Currency>PLN</Currency></Total></Invoice></KSeF>'),

  -- Medium risk invoices
    (gen_random_uuid(), p_company_id, v4,
     'KSeF/2026/0005/DEMO', 'FV/2026/03/005', 6800.00, 'PLN',
     (CURRENT_DATE - INTERVAL '25 days')::text, (CURRENT_DATE - INTERVAL '11 days')::text,
     'PL44109024027777777700000000', 'medium',
     '9191234567', '0000000000', 'Media & Marketing Group',
     '<?xml version="1.0" encoding="UTF-8"?><KSeF><Invoice><Header><InvoiceNumber>FV/2026/03/005</InvoiceNumber><IssueDate>' || (CURRENT_DATE - INTERVAL '25 days')::text || '</IssueDate></Header><Seller><NIP>9191234567</NIP><Name>Media &amp; Marketing Group</Name></Seller><Buyer><NIP>0000000000</NIP></Buyer><Total><Amount>6800.00</Amount><Currency>PLN</Currency></Total></Invoice></KSeF>'),

    (gen_random_uuid(), p_company_id, v4,
     'KSeF/2026/0006/DEMO', 'FV/2026/03/006', 5300.00, 'PLN',
     (CURRENT_DATE - INTERVAL '15 days')::text, (CURRENT_DATE - INTERVAL '1 days')::text,
     'PL61109024027777777700000001', 'medium',
     '9191234567', '0000000000', 'Media & Marketing Group',
     '<?xml version="1.0" encoding="UTF-8"?><KSeF><Invoice><Header><InvoiceNumber>FV/2026/03/006</InvoiceNumber><IssueDate>' || (CURRENT_DATE - INTERVAL '15 days')::text || '</IssueDate></Header><Seller><NIP>9191234567</NIP><Name>Media &amp; Marketing Group</Name></Seller><Buyer><NIP>0000000000</NIP></Buyer><Total><Amount>5300.00</Amount><Currency>PLN</Currency></Total></Invoice></KSeF>'),

    (gen_random_uuid(), p_company_id, v2,
     'KSeF/2026/0007/DEMO', 'FV/2026/03/007', 8750.50, 'PLN',
     (CURRENT_DATE - INTERVAL '8 days')::text, (CURRENT_DATE + INTERVAL '6 days')::text,
     'PL27114020040000320200000000', 'medium',
     '7271234567', '0000000000', 'Usługi Budowlane Kowalski',
     '<?xml version="1.0" encoding="UTF-8"?><KSeF><Invoice><Header><InvoiceNumber>FV/2026/03/007</InvoiceNumber><IssueDate>' || (CURRENT_DATE - INTERVAL '8 days')::text || '</IssueDate></Header><Seller><NIP>7271234567</NIP><Name>Usługi Budowlane Kowalski</Name></Seller><Buyer><NIP>0000000000</NIP></Buyer><Total><Amount>8750.50</Amount><Currency>PLN</Currency></Total></Invoice></KSeF>'),

    (gen_random_uuid(), p_company_id, v2,
     'KSeF/2026/0008/DEMO', 'FV/2026/03/008', 11200.00, 'PLN',
     (CURRENT_DATE - INTERVAL '5 days')::text, (CURRENT_DATE + INTERVAL '9 days')::text,
     'PL27114020040000320200000000', 'medium',
     '7271234567', '0000000000', 'Usługi Budowlane Kowalski',
     '<?xml version="1.0" encoding="UTF-8"?><KSeF><Invoice><Header><InvoiceNumber>FV/2026/03/008</InvoiceNumber><IssueDate>' || (CURRENT_DATE - INTERVAL '5 days')::text || '</IssueDate></Header><Seller><NIP>7271234567</NIP><Name>Usługi Budowlane Kowalski</Name></Seller><Buyer><NIP>0000000000</NIP></Buyer><Total><Amount>11200.00</Amount><Currency>PLN</Currency></Total></Invoice></KSeF>'),

  -- High risk invoices
    (gen_random_uuid(), p_company_id, v5,
     'KSeF/2026/0009/DEMO', 'FV/2026/03/009', 21000.00, 'PLN',
     (CURRENT_DATE - INTERVAL '27 days')::text, (CURRENT_DATE - INTERVAL '13 days')::text,
     'PL73116022020000000219326600', 'high',
     '6572345678', '0000000000', 'Energia Odnawialna Sp. k.',
     '<?xml version="1.0" encoding="UTF-8"?><KSeF><Invoice><Header><InvoiceNumber>FV/2026/03/009</InvoiceNumber><IssueDate>' || (CURRENT_DATE - INTERVAL '27 days')::text || '</IssueDate></Header><Seller><NIP>6572345678</NIP><Name>Energia Odnawialna Sp. k.</Name></Seller><Buyer><NIP>0000000000</NIP></Buyer><Total><Amount>21000.00</Amount><Currency>PLN</Currency></Total></Invoice></KSeF>'),

    (gen_random_uuid(), p_company_id, v5,
     'KSeF/2026/0010/DEMO', 'FV/2026/03/010', 18500.00, 'PLN',
     (CURRENT_DATE - INTERVAL '19 days')::text, (CURRENT_DATE - INTERVAL '5 days')::text,
     'PL73116022020000000219326601', 'high',
     '6572345678', '0000000000', 'Energia Odnawialna Sp. k.',
     '<?xml version="1.0" encoding="UTF-8"?><KSeF><Invoice><Header><InvoiceNumber>FV/2026/03/010</InvoiceNumber><IssueDate>' || (CURRENT_DATE - INTERVAL '19 days')::text || '</IssueDate></Header><Seller><NIP>6572345678</NIP><Name>Energia Odnawialna Sp. k.</Name></Seller><Buyer><NIP>0000000000</NIP></Buyer><Total><Amount>18500.00</Amount><Currency>PLN</Currency></Total></Invoice></KSeF>'),

    (gen_random_uuid(), p_company_id, v4,
     'KSeF/2026/0011/DEMO', 'FV/2026/03/011', 9900.00, 'PLN',
     (CURRENT_DATE - INTERVAL '12 days')::text, (CURRENT_DATE + INTERVAL '2 days')::text,
     'PL61109024027777777700000000', 'high',
     '9191234567', '0000000000', 'Media & Marketing Group',
     '<?xml version="1.0" encoding="UTF-8"?><KSeF><Invoice><Header><InvoiceNumber>FV/2026/03/011</InvoiceNumber><IssueDate>' || (CURRENT_DATE - INTERVAL '12 days')::text || '</IssueDate></Header><Seller><NIP>9191234567</NIP><Name>Media &amp; Marketing Group</Name></Seller><Buyer><NIP>0000000000</NIP></Buyer><Total><Amount>9900.00</Amount><Currency>PLN</Currency></Total></Invoice></KSeF>'),

    (gen_random_uuid(), p_company_id, v2,
     'KSeF/2026/0012/DEMO', 'FV/2026/03/012', 15600.00, 'PLN',
     (CURRENT_DATE - INTERVAL '3 days')::text, (CURRENT_DATE + INTERVAL '11 days')::text,
     'PL27114020040000320200000001', 'high',
     '7271234567', '0000000000', 'Usługi Budowlane Kowalski',
     '<?xml version="1.0" encoding="UTF-8"?><KSeF><Invoice><Header><InvoiceNumber>FV/2026/03/012</InvoiceNumber><IssueDate>' || (CURRENT_DATE - INTERVAL '3 days')::text || '</IssueDate></Header><Seller><NIP>7271234567</NIP><Name>Usługi Budowlane Kowalski</Name></Seller><Buyer><NIP>0000000000</NIP></Buyer><Total><Amount>15600.00</Amount><Currency>PLN</Currency></Total></Invoice></KSeF>');

END;
$$;
