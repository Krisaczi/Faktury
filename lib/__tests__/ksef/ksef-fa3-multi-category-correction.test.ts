import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFa2Xml } from '../../ksef/xml-builder';
import { validateFa3Xml } from '../../ksef/xml-validator';
import { detectCorrectionType, serializeCorrectionInvoice } from '../../ksef/correction-serializer';
import type { IssuedInvoiceWithItems } from '../../../types/issued-invoice';

function makeInvoice(overrides: Partial<IssuedInvoiceWithItems> = {}): IssuedInvoiceWithItems {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    company_id: '00000000-0000-0000-0000-000000000002',
    invoice_number: 'FV 003/10/2026',
    status: 'issued',
    currency: 'PLN',
    issue_date: '2026-10-28',
    sale_date: null,
    due_date: '2026-11-04',
    payment_method: 'transfer',
    seller_name: 'KrisAczi',
    seller_nip: '5213256335',
    seller_address: 'Kluczborska 4/77, 01-461 Warszawa',
    seller_bank_account: 'PL02105010251000009083947912',
    buyer_name: 'AMG - Antoni Mrozowski Usługi Geodezyjne',
    buyer_nip: '5212897517',
    buyer_address: 'Kuratowskiego 1/8, 02-747 Warszawa',
    buyer_email: null,
    net_total: -50,
    vat_total: 0,
    gross_total: -50,
    notes: 'Zwolnienie podmiotowe z VAT na podstawie art. 113 ust. 1 ustawy o VAT',
    ksef_reference_no: null,
    ksef_session_token: null,
    ksef_status: null,
    ksef_error_message: null,
    ksef_sent_at: null,
    ksef_accepted_at: null,
    created_by: null,
    created_at: '2026-10-28T10:00:00Z',
    updated_at: '2026-10-28T10:00:00Z',
    company_bank_account: null,
    document_type: 'CORRECTION',
    corrected_invoice_number: 'FV 002/09/2026',
    corrected_invoice_date: '2026-10-11',
    corrected_invoice_ksef_no: '1',
    correction_reason: 'korekta VAT',
    items: [],
    ...overrides,
  } as unknown as IssuedInvoiceWithItems;
}

/**
 * Reproduces the exact scenario from the reference XML:
 * - Line 1: reversal of a 0% KR line (0_kr rate, negative net)
 * - Line 2: reversal of a np II line (np_ii rate, negative net)
 * - Line 3: new zw line (zw rate, positive net)
 *
 * Expected P_13 fields: P_13_6_1=-50, P_13_8=-50, P_13_7=50, P_15=-50
 * P_18=2, P_19=1 (zw is the only active positive category)
 */
const multiCategoryCorrection = makeInvoice({
  net_total: -50,
  vat_total: 0,
  gross_total: -50,
  items: [
    {
      id: 'a', invoice_id: 'x', position: 1,
      name: 'Korekta błędnego wiersza (Stawka 0%)', unit: 'szt.',
      quantity: -1, unit_price_net: 50, vat_rate: '0_kr',
      net_amount: -50, vat_amount: 0, gross_amount: -50, discount_pct: null,
    },
    {
      id: 'b', invoice_id: 'x', position: 2,
      name: 'Korekta błędnego wiersza (Stawka np II)', unit: 'szt.',
      quantity: -1, unit_price_net: 50, vat_rate: 'np_ii',
      net_amount: -50, vat_amount: 0, gross_amount: -50, discount_pct: null,
    },
    {
      id: 'c', invoice_id: 'x', position: 3,
      name: 'Wprowadzenie prawidłowego zapisu (Stawka zw)', unit: 'szt.',
      quantity: 1, unit_price_net: 50, vat_rate: 'zw',
      net_amount: 50, vat_amount: 0, gross_amount: 50, discount_pct: null,
    },
  ] as never,
});

// ─── P_13_6_1 (0 KR) Support ─────────────────────────────────────────────────

describe('FA(3) — 0% KR (P_13_6_1) support', () => {
  it('maps 0_kr rate to P_13_6_1 element', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    assert.ok(xml.includes('<P_13_6_1>-50.00</P_13_6_1>'), '0_kr must map to P_13_6_1 with value -50.00');
  });

  it('emits P_12 value "0 KR" for 0_kr rate line items', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    assert.ok(xml.includes('<P_12>0 KR</P_12>'), 'P_12 must be "0 KR" for 0_kr rate');
  });

  it('P_13_6_1 appears after P_13_5 and before P_13_7 in element order', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    const p13_5Pos = xml.indexOf('<P_13_5');
    const p13_6_1Pos = xml.indexOf('<P_13_6_1');
    const p13_7Pos = xml.indexOf('<P_13_7');
    assert.ok(p13_6_1Pos > -1, 'P_13_6_1 must be present');
    // P_13_5 not present in this invoice (no '0' rate), so only check P_13_6_1 < P_13_7
    assert.ok(p13_6_1Pos < p13_7Pos, 'P_13_6_1 must come before P_13_7');
  });

  it('validator accepts P_12 value "0 KR" as valid', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    const result = validateFa3Xml(xml, multiCategoryCorrection);
    const invalidRateErrors = result.errors.filter(e => e.rule === 'invalid_vat_rate');
    assert.equal(invalidRateErrors.length, 0, 'Should not report "0 KR" as invalid P_12');
  });
});

// ─── np II Support ───────────────────────────────────────────────────────────

describe('FA(3) — np II support', () => {
  it('maps np_ii rate to P_13_8 element (shared with np)', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    assert.ok(xml.includes('<P_13_8>'), 'np_ii must map to P_13_8');
    // Both np_ii reversal (-50) should produce P_13_8 = -50.00
    assert.ok(xml.includes('<P_13_8>-50.00</P_13_8>'), 'P_13_8 should be -50.00 from np_ii reversal');
  });

  it('emits P_12 value "np II" for np_ii rate line items', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    assert.ok(xml.includes('<P_12>np II</P_12>'), 'P_12 must be "np II" for np_ii rate');
  });

  it('validator accepts P_12 value "np II" as valid', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    const result = validateFa3Xml(xml, multiCategoryCorrection);
    const invalidRateErrors = result.errors.filter(e => e.rule === 'invalid_vat_rate');
    assert.equal(invalidRateErrors.length, 0, 'Should not report "np II" as invalid P_12');
  });

  it('aggregates np and np_ii into the same P_13_8 element', () => {
    const inv = makeInvoice({
      net_total: 100, vat_total: 0, gross_total: 100,
      items: [
        {
          id: 'a', invoice_id: 'x', position: 1,
          name: 'np I item', unit: 'szt.',
          quantity: 1, unit_price_net: 60, vat_rate: 'np',
          net_amount: 60, vat_amount: 0, gross_amount: 60, discount_pct: null,
        },
        {
          id: 'b', invoice_id: 'x', position: 2,
          name: 'np II item', unit: 'szt.',
          quantity: 1, unit_price_net: 40, vat_rate: 'np_ii',
          net_amount: 40, vat_amount: 0, gross_amount: 40, discount_pct: null,
        },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    // Both np and np_ii should aggregate into a single P_13_8 = 100.00
    assert.ok(xml.includes('<P_13_8>100.00</P_13_8>'), 'P_13_8 should be 100.00 (60+40 aggregated)');
    // Only one P_13_8 element should appear
    const p13_8Count = (xml.match(/<P_13_8>/g) || []).length;
    assert.equal(p13_8Count, 1, 'Should have exactly one P_13_8 element (aggregated)');
  });
});

// ─── Multi-Category Reversal Scenario ────────────────────────────────────────

describe('FA(3) — multi-category reversal (0 KR + np II → zw)', () => {
  it('generates all expected P_13 fields with correct values', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    assert.ok(xml.includes('<P_13_6_1>-50.00</P_13_6_1>'), 'P_13_6_1 should be -50.00 (0 KR reversal)');
    assert.ok(xml.includes('<P_13_8>-50.00</P_13_8>'), 'P_13_8 should be -50.00 (np II reversal)');
    assert.ok(xml.includes('<P_13_7>50.00</P_13_7>'), 'P_13_7 should be 50.00 (zw new line)');
    assert.ok(!xml.includes('<P_13_9'), 'P_13_9 should not be emitted (conditional field)');
    assert.ok(xml.includes('<P_15>-50.00</P_15>'), 'P_15 should be -50.00');
  });

  it('passes full FA(3) validation', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    const result = validateFa3Xml(xml, multiCategoryCorrection);
    assert.ok(result.valid, `Should be valid: ${result.errors.map(e => e.message).join('; ')}`);
  });

  it('sets P_18=2 and P_19=1 (zw is the only active positive category)', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    assert.ok(xml.includes('<P_18>2</P_18>'), 'P_18 must be 2 (no reverse charge)');
    assert.ok(xml.includes('<P_19>1</P_19>'), 'P_19 must be 1 (VAT exempt)');
    assert.ok(!xml.includes('<P_18>1</P_18>'), 'P_18 must NOT be 1');
  });

  it('uses DoRozliczenia for negative gross_total', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    assert.ok(xml.includes('<DoRozliczenia>50.00</DoRozliczenia>'), 'Must use DoRozliczenia with |gross| = 50.00');
    assert.ok(!xml.includes('<DoZaplaty>'), 'Must NOT use DoZaplaty for negative gross');
  });

  it('includes NrKSeF + NrKSeFFaKorygowanej from corrected_invoice_ksef_no', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    assert.ok(xml.includes('<NrKSeF>1</NrKSeF>'), 'Must include NrKSeF=1 marker');
    assert.ok(xml.includes('<NrKSeFFaKorygowanej>1</NrKSeFFaKorygowanej>'), 'Must include NrKSeFFaKorygowanej with value "1"');
    assert.ok(!xml.includes('<NrKSeFN'), 'NrKSeFN must not appear when KSeF number is available');
  });

  it('includes RodzajFaktury=KOR and PrzyczynaKorekty', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    assert.ok(xml.includes('<RodzajFaktury>KOR</RodzajFaktury>'), 'Must use KOR');
    assert.ok(xml.includes('<PrzyczynaKorekty>korekta VAT</PrzyczynaKorekty>'), 'Must include correction reason');
  });

  it('includes DaneFaKorygowanej with correct original invoice data', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    assert.ok(xml.includes('<DataWystFaKorygowanej>2026-10-11</DataWystFaKorygowanej>'), 'Must include original date');
    assert.ok(xml.includes('<NrFaKorygowanej>FV 002/09/2026</NrFaKorygowanej>'), 'Must include original number');
  });

  it('emits P_8B with 2 decimal places', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    assert.ok(xml.includes('<P_8B>1.00</P_8B>'), 'P_8B should be "1.00" (2 decimal places)');
    assert.ok(!xml.includes('<P_8B>1.0000</P_8B>'), 'P_8B should NOT be "1.0000"');
  });

  it('keeps P_9A positive for all line items', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    assert.ok(!xml.includes('<P_9A>-'), 'No P_9A should be negative');
    assert.ok(xml.includes('<P_9A>50.00</P_9A>'), 'P_9A should be 50.00');
  });

  it('summary is consistent: P_13_6_1 + P_13_8 + P_13_7 = P_15', () => {
    const xml = buildFa2Xml(multiCategoryCorrection);
    const result = validateFa3Xml(xml, multiCategoryCorrection);
    assert.ok(result.summaryCheck, 'Summary check should be present');
    assert.ok(result.summaryCheck!.consistent, `Summary should be consistent: ${JSON.stringify(result.summaryCheck)}`);
  });
});

// ─── Correction Serializer Integration ───────────────────────────────────────

describe('Correction serializer — multi-category reversal integration', () => {
  it('detects VAT classification change for multi-category correction', () => {
    const info = detectCorrectionType(multiCategoryCorrection);
    assert.equal(info.type, 'vat_classification');
  });

  it('passes all 3 validation stages', () => {
    const result = serializeCorrectionInvoice(multiCategoryCorrection);
    assert.ok(result.valid, `Should be valid: ${result.errors.map(e => e.message).join('; ')}`);
    assert.ok(result.rawXml, 'XML should be generated');
    assert.ok(result.xmlValidation, 'XML validation should run');
    assert.ok(result.xmlValidation!.valid, `XML validation should pass: ${result.xmlValidation!.errors.map(e => e.message).join('; ')}`);
  });
});

// ─── 0 WDT and 0 EX variants ─────────────────────────────────────────────────

describe('FA(3) — 0% WDT and 0% EX variants', () => {
  it('maps 0_wdt rate to P_13_6_2 element with P_12="0 WDT"', () => {
    const inv = makeInvoice({
      net_total: 100, vat_total: 0, gross_total: 100,
      corrected_invoice_number: '',
      items: [
        {
          id: 'a', invoice_id: 'x', position: 1,
          name: 'WDT item', unit: 'szt.',
          quantity: 1, unit_price_net: 100, vat_rate: '0_wdt',
          net_amount: 100, vat_amount: 0, gross_amount: 100, discount_pct: null,
        },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_13_6_2>100.00</P_13_6_2>'), '0_wdt must map to P_13_6_2');
    assert.ok(xml.includes('<P_12>0 WDT</P_12>'), 'P_12 must be "0 WDT"');
  });

  it('maps 0_ex rate to P_13_6_3 element with P_12="0 EX"', () => {
    const inv = makeInvoice({
      net_total: 100, vat_total: 0, gross_total: 100,
      corrected_invoice_number: '',
      items: [
        {
          id: 'a', invoice_id: 'x', position: 1,
          name: 'Export item', unit: 'szt.',
          quantity: 1, unit_price_net: 100, vat_rate: '0_ex',
          net_amount: 100, vat_amount: 0, gross_amount: 100, discount_pct: null,
        },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_13_6_3>100.00</P_13_6_3>'), '0_ex must map to P_13_6_3');
    assert.ok(xml.includes('<P_12>0 EX</P_12>'), 'P_12 must be "0 EX"');
  });
});
