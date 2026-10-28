import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFa2Xml } from '../../ksef/xml-builder';
import { validateFa3Xml } from '../../ksef/xml-validator';
import type { IssuedInvoiceWithItems } from '../../../types/issued-invoice';

function makeInvoice(overrides: Partial<IssuedInvoiceWithItems> = {}): IssuedInvoiceWithItems {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    company_id: '00000000-0000-0000-0000-000000000002',
    invoice_number: 'FV/2026/09/001',
    status: 'issued',
    currency: 'PLN',
    issue_date: '2026-09-20',
    sale_date: null,
    due_date: '2026-09-20',
    payment_method: 'transfer',
    seller_name: 'Test Seller Sp. z o.o.',
    seller_nip: '1234567890',
    seller_address: 'ul. Testowa 1, 00-001 Warszawa',
    seller_bank_account: 'PL02105010251000009083947912',
    buyer_name: 'Test Buyer Sp. z o.o.',
    buyer_nip: '0987654321',
    buyer_address: 'ul. Kupca 2, 00-002 Warszawa',
    buyer_email: null,
    net_total: 1000,
    vat_total: 230,
    gross_total: 1230,
    notes: null,
    ksef_reference_no: null,
    ksef_session_token: null,
    ksef_status: null,
    ksef_error_message: null,
    ksef_sent_at: null,
    ksef_accepted_at: null,
    created_by: null,
    created_at: '2026-09-20T10:00:00Z',
    updated_at: '2026-09-20T10:00:00Z',
    company_bank_account: null,
    items: [{
      id: '00000000-0000-0000-0000-000000000010',
      invoice_id: '00000000-0000-0000-0000-000000000001',
      position: 1,
      name: 'Usługa testowa',
      unit: 'szt.',
      quantity: 1,
      unit_price_net: 1000,
      vat_rate: '23',
      net_amount: 1000,
      vat_amount: 230,
      gross_amount: 1230,
      discount_pct: null,
    }],
    ...overrides,
  } as unknown as IssuedInvoiceWithItems;
}

// ─── VAT Exempt Correction Invoice ────────────────────────────────────────────

describe('FA(3) — VAT Exempt Correction Invoice', () => {
  const exemptCorrection = makeInvoice({
    document_type: 'CORRECTION',
    invoice_number: 'FK/2026/10/001',
    net_total: -50,
    vat_total: 0,
    gross_total: -50,
    notes: 'Korekja faktury — zwolnienie podmiotowe z VAT na podstawie art. 113 ust. 1 ustawy o VAT',
    corrected_invoice_number: 'FV/2026/09/001',
    corrected_invoice_date: '2026-09-20',
    correction_reason: 'Zwrot towaru',
    items: [{
      id: '00000000-0000-0000-0000-000000000010',
      invoice_id: '00000000-0000-0000-0000-000000000001',
      position: 1,
      name: 'Korekta usługi programistycznej',
      unit: 'szt.',
      quantity: -1,
      unit_price_net: 50,
      vat_rate: 'zw',
      net_amount: -50,
      vat_amount: 0,
      gross_amount: -50,
      discount_pct: null,
    }],
  });

  it('generates valid XML that passes FA(3) validation', () => {
    const xml = buildFa2Xml(exemptCorrection);
    const result = validateFa3Xml(xml, exemptCorrection);
    assert.ok(result.valid, `XML should be valid, errors: ${result.errors.map(e => e.message).join('; ')}`);
  });

  it('uses RodzajFaktury=KOR for correction invoices', () => {
    const xml = buildFa2Xml(exemptCorrection);
    assert.ok(xml.includes('<RodzajFaktury>KOR</RodzajFaktury>'), 'Must use KOR for corrections');
  });

  it('includes PrzyczynaKorekty and DaneFaKorygowanej', () => {
    const xml = buildFa2Xml(exemptCorrection);
    assert.ok(xml.includes('<PrzyczynaKorekty>Zwrot towaru</PrzyczynaKorekty>'), 'Must include correction reason');
    assert.ok(xml.includes('<NrFaKorygowanej>FV/2026/09/001</NrFaKorygowanej>'), 'Must include corrected invoice number');
    assert.ok(xml.includes('<DataWystFaKorygowanej>2026-09-20</DataWystFaKorygowanej>'), 'Must include corrected invoice date');
  });

  it('maps zw to P_13_7 only — no P_13_8, P_13_10, or other summary fields', () => {
    const xml = buildFa2Xml(exemptCorrection);
    assert.ok(xml.includes('<P_13_7>-50.00</P_13_7>'), 'zw must map to P_13_7');
    assert.ok(!xml.includes('<P_13_8'), 'P_13_8 must NOT appear for zw-only invoice');
    assert.ok(!xml.includes('<P_13_10'), 'P_13_10 must NOT appear for zw-only invoice');
    assert.ok(!xml.includes('<P_13_1'), 'P_13_1 must NOT appear for zw-only invoice');
  });

  it('sets P_18=2 (not reverse charge) for VAT exempt invoices', () => {
    const xml = buildFa2Xml(exemptCorrection);
    assert.ok(xml.includes('<P_18>2</P_18>'), 'P_18 must be 2 for VAT exempt — NOT 1 (reverse charge)');
    assert.ok(!xml.includes('<P_18>1</P_18>'), 'P_18 must NOT be 1 for VAT exempt');
  });

  it('keeps P_9A positive even for negative correction amounts', () => {
    const xml = buildFa2Xml(exemptCorrection);
    assert.ok(xml.includes('<P_9A>50.00</P_9A>'), 'P_9A must be positive (50.00), not negative');
    assert.ok(!xml.includes('<P_9A>-50.00</P_9A>'), 'P_9A must NOT be negative');
    // P_11 (net amount) should be negative — that's how the correction is reflected
    assert.ok(xml.includes('<P_11>-50.00</P_11>'), 'P_11 should be -50.00 (correction amount)');
  });

  it('has consistent summary: P_13_7 + P_13_9 equals P_15', () => {
    const xml = buildFa2Xml(exemptCorrection);
    const result = validateFa3Xml(xml, exemptCorrection);
    assert.ok(result.summaryCheck, 'Summary check should be present');
    assert.ok(result.summaryCheck!.consistent, `Summary should be consistent: ${JSON.stringify(result.summaryCheck)}`);
  });

  it('P_13_9 comes after P_13_7 in the XML', () => {
    const xml = buildFa2Xml(exemptCorrection);
    const p13_7Pos = xml.indexOf('<P_13_7');
    const p13_9Pos = xml.indexOf('<P_13_9');
    assert.ok(p13_7Pos > -1, 'P_13_7 should be present');
    assert.ok(p13_9Pos > -1, 'P_13_9 should be present');
    assert.ok(p13_7Pos < p13_9Pos, 'P_13_7 must come before P_13_9');
  });

  it('P_15 comes after P_13_9 in the XML', () => {
    const xml = buildFa2Xml(exemptCorrection);
    const p13_9Pos = xml.indexOf('<P_13_9');
    const p15Pos = xml.indexOf('<P_15');
    assert.ok(p13_9Pos < p15Pos, 'P_13_9 must come before P_15');
  });
});

// ─── Summary Consistency Checks ───────────────────────────────────────────────

describe('FA(3) — Summary consistency validation', () => {
  it('passes validation when SUM(P_13_*) === P_13_9 === P_15 for 23% invoice', () => {
    const inv = makeInvoice();
    const xml = buildFa2Xml(inv);
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.valid, `Should be valid: ${result.errors.map(e => e.message).join('; ')}`);
    assert.ok(result.summaryCheck?.consistent, 'Summary should be consistent');
  });

  it('passes validation for mixed 23% + 8% invoice', () => {
    const inv = makeInvoice({
      net_total: 2000,
      vat_total: 310,
      gross_total: 2310,
      items: [
        {
          id: '00000000-0000-0000-0000-000000000010',
          invoice_id: '00000000-0000-0000-0000-000000000001',
          position: 1, name: 'Usługa A', unit: 'szt.',
          quantity: 1, unit_price_net: 1000, vat_rate: '23',
          net_amount: 1000, vat_amount: 230, gross_amount: 1230, discount_pct: null,
        },
        {
          id: '00000000-0000-0000-0000-000000000011',
          invoice_id: '00000000-0000-0000-0000-000000000001',
          position: 2, name: 'Usługa B', unit: 'szt.',
          quantity: 1, unit_price_net: 1000, vat_rate: '8',
          net_amount: 1000, vat_amount: 80, gross_amount: 1080, discount_pct: null,
        },
      ],
    });
    const xml = buildFa2Xml(inv);
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.valid, `Should be valid: ${result.errors.map(e => e.message).join('; ')}`);
  });

  it('detects when P_13_9 does not match sum of per-rate P_13 values', () => {
    const inv = makeInvoice({
      net_total: 1500, // Wrong — should be 1000
      vat_total: 230,
      gross_total: 1230,
      items: [{
        id: '00000000-0000-0000-0000-000000000010',
        invoice_id: '00000000-0000-0000-0000-000000000001',
        position: 1, name: 'Usługa', unit: 'szt.',
        quantity: 1, unit_price_net: 1000, vat_rate: '23',
        net_amount: 1000, vat_amount: 230, gross_amount: 1230, discount_pct: null,
      }],
    });
    const xml = buildFa2Xml(inv);
    const result = validateFa3Xml(xml, inv);
    // P_13_9 is computed from line items (1000) but inv.net_total is 1500
    assert.ok(!result.valid, 'Should fail validation when net_total mismatch');
    assert.ok(
      result.errors.some(e => e.rule === 'summary_net_total_mismatch'),
      'Should report net_total mismatch',
    );
  });

  it('detects when gross_total does not match P_15', () => {
    const inv = makeInvoice({
      net_total: 1000,
      vat_total: 230,
      gross_total: 2000, // Wrong — should be 1230
      items: [{
        id: '00000000-0000-0000-0000-000000000010',
        invoice_id: '00000000-0000-0000-0000-000000000001',
        position: 1, name: 'Usługa', unit: 'szt.',
        quantity: 1, unit_price_net: 1000, vat_rate: '23',
        net_amount: 1000, vat_amount: 230, gross_amount: 1230, discount_pct: null,
      }],
    });
    const xml = buildFa2Xml(inv);
    const result = validateFa3Xml(xml, inv);
    assert.ok(!result.valid, 'Should fail validation when gross_total mismatch');
    assert.ok(
      result.errors.some(e => e.rule === 'summary_gross_total_mismatch' || e.rule === 'summary_p15_mismatch'),
      'Should report gross_total or P_15 mismatch',
    );
  });
});

// ─── Negative P_9A Rejection ──────────────────────────────────────────────────

describe('FA(3) — Negative P_9A rejection', () => {
  it('rejects XML with negative P_9A values', () => {
    // Simulate an XML with negative P_9A (what the old builder would produce)
    const badXml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>1234567890</NIP><Nazwa>Seller</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>0987654321</NIP><Nazwa>Buyer</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-09-20</P_1>
    <P_2>FV/001</P_2>
    <P_13_7>-50.00</P_13_7>
    <P_13_9>-50.00</P_13_9>
    <P_15>-50.00</P_15>
    <Adnotacje><P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A><Zwolnienie><P_19>1</P_19><P_19A>zwolnienie</P_19A></Zwolnienie></Adnotacje>
    <RodzajFaktury>KOR</RodzajFaktury>
    <PrzyczynaKorekty>test</PrzyczynaKorekty>
    <DaneFaKorygowanej><DataWystFaKorygowanej>2026-09-20</DataWystFaKorygowanej><NrFaKorygowanej>FV/001</NrFaKorygowanej></DaneFaKorygowanej>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Test</P_7>
      <P_8A>szt.</P_8A>
      <P_8B>1.0000</P_8B>
      <P_9A>-50.00</P_9A>
      <P_11>-50.00</P_11>
      <P_12>zw</P_12>
    </FaWiersz>
    <Rozliczenie><DoRozliczenia>50.00</DoRozliczenia></Rozliczenie>
    <Platnosc><FormaPlatnosci>6</FormaPlatnosci></Platnosc>
  </Fa>
</Faktura>`;
    const inv = makeInvoice({
      net_total: -50, vat_total: 0, gross_total: -50,
      document_type: 'CORRECTION',
      corrected_invoice_number: 'FV/001',
      items: [{
        id: '00000000-0000-0000-0000-000000000010',
        invoice_id: '00000000-0000-0000-0000-000000000001',
        position: 1, name: 'Test', unit: 'szt.',
        quantity: 1, unit_price_net: -50, vat_rate: 'zw',
        net_amount: -50, vat_amount: 0, gross_amount: -50, discount_pct: null,
      }],
    });
    const result = validateFa3Xml(badXml, inv);
    assert.ok(!result.valid, 'Should fail validation');
    assert.ok(
      result.errors.some(e => e.rule === 'negative_p9a'),
      'Should detect negative P_9A',
    );
  });

  it('the fixed builder never produces negative P_9A for corrections', () => {
    const correction = makeInvoice({
      document_type: 'CORRECTION',
      net_total: -100, vat_total: -23, gross_total: -123,
      corrected_invoice_number: 'FV/2026/09/001',
      corrected_invoice_date: '2026-09-20',
      correction_reason: 'Błąd na fakturze',
      items: [{
        id: '00000000-0000-0000-0000-000000000010',
        invoice_id: '00000000-0000-0000-0000-000000000001',
        position: 1, name: 'Korekta', unit: 'szt.',
        quantity: -1, unit_price_net: -100, vat_rate: '23',
        net_amount: -100, vat_amount: -23, gross_amount: -123, discount_pct: null,
      }],
    });
    const xml = buildFa2Xml(correction);
    const result = validateFa3Xml(xml, correction);
    assert.ok(result.valid, `Should be valid: ${result.errors.map(e => e.message).join('; ')}`);
    assert.ok(!xml.includes('<P_9A>-'), 'P_9A should never be negative in generated XML');
  });
});

// ─── P_18 Annotation Mapping ──────────────────────────────────────────────────

describe('FA(3) — P_18 annotation mapping', () => {
  it('P_18=2 for VAT exempt (zw) — never reverse charge', () => {
    const inv = makeInvoice({
      net_total: 50, vat_total: 0, gross_total: 50,
      notes: 'Zwolnienie z VAT art. 113',
      items: [{
        id: '00000000-0000-0000-0000-000000000010',
        invoice_id: '00000000-0000-0000-0000-000000000001',
        position: 1, name: 'Usługa', unit: 'szt.',
        quantity: 1, unit_price_net: 50, vat_rate: 'zw',
        net_amount: 50, vat_amount: 0, gross_amount: 50, discount_pct: null,
      }],
    });
    const xml = buildFa2Xml(inv);
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.valid, `Should be valid: ${result.errors.map(e => e.message).join('; ')}`);
    assert.ok(xml.includes('<P_18>2</P_18>'), 'P_18 must be 2 for VAT exempt');
  });

  it('P_18=1 for reverse charge (oo)', () => {
    const inv = makeInvoice({
      net_total: 300, vat_total: 0, gross_total: 300,
      items: [{
        id: '00000000-0000-0000-0000-000000000010',
        invoice_id: '00000000-0000-0000-0000-000000000001',
        position: 1, name: 'Usługa', unit: 'szt.',
        quantity: 1, unit_price_net: 300, vat_rate: 'oo',
        net_amount: 300, vat_amount: 0, gross_amount: 300, discount_pct: null,
      }],
    });
    const xml = buildFa2Xml(inv);
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.valid, `Should be valid: ${result.errors.map(e => e.message).join('; ')}`);
    assert.ok(xml.includes('<P_18>1</P_18>'), 'P_18 must be 1 for reverse charge');
  });

  it('P_18=2 for standard 23% invoice (no reverse charge)', () => {
    const inv = makeInvoice();
    const xml = buildFa2Xml(inv);
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.valid, `Should be valid: ${result.errors.map(e => e.message).join('; ')}`);
    assert.ok(xml.includes('<P_18>2</P_18>'), 'P_18 must be 2 for standard invoice');
  });

  it('validator detects P_18=1 on exempt invoice as error', () => {
    const inv = makeInvoice({
      net_total: 50, vat_total: 0, gross_total: 50,
      items: [{
        id: '00000000-0000-0000-0000-000000000010',
        invoice_id: '00000000-0000-0000-0000-000000000001',
        position: 1, name: 'Usługa', unit: 'szt.',
        quantity: 1, unit_price_net: 50, vat_rate: 'zw',
        net_amount: 50, vat_amount: 0, gross_amount: 50, discount_pct: null,
      }],
    });
    // Manually create XML with wrong P_18=1
    const xml = buildFa2Xml(inv).replace('<P_18>2</P_18>', '<P_18>1</P_18>');
    const result = validateFa3Xml(xml, inv);
    assert.ok(!result.valid, 'Should fail when P_18=1 on exempt invoice');
    assert.ok(
      result.errors.some(e => e.rule === 'invalid_p18_reverse_charge' || e.rule === 'invalid_p18_exempt_reverse_charge'),
      'Should report P_18 mismatch for exempt invoice with P_18=1',
    );
  });
});

// ─── Spurious P_13 Field Detection ────────────────────────────────────────────

describe('FA(3) — spurious P_13 field detection', () => {
  it('detects when P_13_8 is present but no np items', () => {
    const inv = makeInvoice(); // 23% invoice
    const xml = buildFa2Xml(inv);
    // Inject a spurious P_13_8
    const tamperedXml = xml.replace('<P_13_9>', '<P_13_8>100.00</P_13_8>\n    <P_13_9>');
    const result = validateFa3Xml(tamperedXml, inv);
    assert.ok(
      result.errors.some(e => e.rule === 'spurious_p13_field' && e.element === 'P_13_8'),
      'Should detect spurious P_13_8 for 23% invoice',
    );
  });

  it('does not flag valid P_13 fields for present rates', () => {
    const inv = makeInvoice({
      net_total: 500, vat_total: 0, gross_total: 500,
      items: [
        {
          id: '00000000-0000-0000-0000-000000000010',
          invoice_id: '00000000-0000-0000-0000-000000000001',
          position: 1, name: 'NP', unit: 'szt.',
          quantity: 1, unit_price_net: 200, vat_rate: 'np',
          net_amount: 200, vat_amount: 0, gross_amount: 200, discount_pct: null,
        },
        {
          id: '00000000-0000-0000-0000-000000000011',
          invoice_id: '00000000-0000-0000-0000-000000000001',
          position: 2, name: 'OO', unit: 'szt.',
          quantity: 1, unit_price_net: 300, vat_rate: 'oo',
          net_amount: 300, vat_amount: 0, gross_amount: 300, discount_pct: null,
        },
      ],
    });
    const xml = buildFa2Xml(inv);
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.valid, `Should be valid: ${result.errors.map(e => e.message).join('; ')}`);
    assert.ok(
      !result.errors.some(e => e.rule === 'spurious_p13_field'),
      'Should not flag any spurious P_13 fields',
    );
  });
});

// ─── Element Ordering ─────────────────────────────────────────────────────────

describe('FA(3) — element ordering', () => {
  it('Adnotacje comes before RodzajFaktury', () => {
    const xml = buildFa2Xml(makeInvoice());
    const adnotacjePos = xml.indexOf('<Adnotacje');
    const rodzajPos = xml.indexOf('<RodzajFaktury');
    assert.ok(adnotacjePos > -1 && rodzajPos > -1);
    assert.ok(adnotacjePos < rodzajPos, 'Adnotacje must come before RodzajFaktury');
  });

  it('FaWiersz comes after RodzajFaktury', () => {
    const xml = buildFa2Xml(makeInvoice());
    const faWierszPos = xml.indexOf('<FaWiersz');
    const rodzajPos = xml.indexOf('<RodzajFaktury');
    assert.ok(rodzajPos < faWierszPos, 'FaWiersz must come after RodzajFaktury');
  });

  it('Rozliczenie comes after FaWiersz', () => {
    const xml = buildFa2Xml(makeInvoice());
    const faWierszPos = xml.indexOf('<FaWiersz');
    const rozliczeniePos = xml.indexOf('<Rozliczenie');
    assert.ok(faWierszPos < rozliczeniePos, 'Rozliczenie must come after FaWiersz');
  });

  it('Platnosc comes after Rozliczenie', () => {
    const xml = buildFa2Xml(makeInvoice());
    const rozliczeniePos = xml.indexOf('<Rozliczenie');
    const platnoscPos = xml.indexOf('<Platnosc');
    assert.ok(rozliczeniePos < platnoscPos, 'Platnosc must come after Rozliczenie');
  });

  it('P_13_9 comes after P_13_8 and before P_13_10 in mixed invoice', () => {
    const inv = makeInvoice({
      net_total: 500, vat_total: 0, gross_total: 500,
      items: [
        {
          id: '00000000-0000-0000-0000-000000000010',
          invoice_id: '00000000-0000-0000-0000-000000000001',
          position: 1, name: 'NP', unit: 'szt.',
          quantity: 1, unit_price_net: 200, vat_rate: 'np',
          net_amount: 200, vat_amount: 0, gross_amount: 200, discount_pct: null,
        },
        {
          id: '00000000-0000-0000-0000-000000000011',
          invoice_id: '00000000-0000-0000-0000-000000000001',
          position: 2, name: 'OO', unit: 'szt.',
          quantity: 1, unit_price_net: 300, vat_rate: 'oo',
          net_amount: 300, vat_amount: 0, gross_amount: 300, discount_pct: null,
        },
      ],
    });
    const xml = buildFa2Xml(inv);
    const p13_8Pos = xml.indexOf('<P_13_8');
    const p13_9Pos = xml.indexOf('<P_13_9');
    const p13_10Pos = xml.indexOf('<P_13_10');
    assert.ok(p13_8Pos < p13_9Pos, 'P_13_8 must come before P_13_9');
    assert.ok(p13_9Pos < p13_10Pos, 'P_13_9 must come before P_13_10');
  });
});
