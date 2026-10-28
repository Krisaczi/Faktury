/**
 * Comprehensive tests for the schema-driven FA(3) correction invoice system.
 *
 * Tests cover:
 * 1. VAT exemption corrections
 * 2. 0% VAT corrections (including 0 KR, 0 WDT, 0 EX)
 * 3. NP corrections (np I and np II, with aggregation)
 * 4. Reverse charge corrections
 * 5. Mixed category corrections (multi-category reversal)
 * 6. Mathematical consistency (P_15 = SUM(P_13_*) + SUM(P_14_*))
 * 7. Business rule validation (contradictory categories, annotations)
 * 8. VAT summary engine (dynamic P_13 generation)
 * 9. Validation report generation
 * 10. Pre-submission gate (blocked submissions)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFa2Xml } from '../../ksef/xml-builder';
import { validateFa3Xml } from '../../ksef/xml-validator';
import { computeVatSummary, buildVatSummaryXml } from '../../ksef/vat-summary-engine';
import { generateValidationReport } from '../../ksef/validation-report';
import { P13_FIELDS, perRateP13Elements, faElementPosition, FA_ELEMENT_SEQUENCE } from '../../ksef/fa3-schema';
import { serializeCorrectionInvoice } from '../../ksef/correction-serializer';
import type { IssuedInvoiceWithItems } from '../../../types/issued-invoice';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInvoice(overrides: Partial<IssuedInvoiceWithItems> = {}): IssuedInvoiceWithItems {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    company_id: '00000000-0000-0000-0000-000000000002',
    invoice_number: 'FV/2026/10/001',
    status: 'issued',
    currency: 'PLN',
    issue_date: '2026-10-28',
    sale_date: null,
    due_date: '2026-11-04',
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
    created_at: '2026-10-28T10:00:00Z',
    updated_at: '2026-10-28T10:00:00Z',
    company_bank_account: null,
    document_type: 'CORRECTION',
    corrected_invoice_number: 'FV/2026/09/001',
    corrected_invoice_date: '2026-09-20',
    correction_reason: 'Korekta VAT',
    items: [],
    ...overrides,
  } as unknown as IssuedInvoiceWithItems;
}

function makeItem(rate: string, net: number, vat: number, gross: number, position = 1) {
  return {
    id: `item-${position}`,
    invoice_id: 'x',
    position,
    name: `Item ${rate}`,
    unit: 'szt.',
    quantity: net < 0 ? -1 : 1,
    unit_price_net: Math.abs(net),
    vat_rate: rate,
    net_amount: net,
    vat_amount: vat,
    gross_amount: gross,
    discount_pct: null,
  } as never;
}

// ─── 1. VAT Exemption Corrections ────────────────────────────────────────────

describe('Schema-driven FA(3) — VAT exemption corrections', () => {
  it('generates valid XML for zw-only correction', () => {
    const inv = makeInvoice({
      net_total: 500, vat_total: 0, gross_total: 500,
      items: [makeItem('zw', 500, 0, 500)],
    });
    const xml = buildFa2Xml(inv);
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.valid, `Should be valid: ${result.errors.map(e => e.message).join('; ')}`);
    assert.ok(xml.includes('<P_13_7>500.00</P_13_7>'), 'P_13_7 for zw');
  });

  it('reversal of zw category produces negative P_13_7', () => {
    const inv = makeInvoice({
      net_total: -500, vat_total: 0, gross_total: -500,
      items: [makeItem('zw', -500, 0, -500)],
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_13_7>-500.00</P_13_7>'), 'Negative P_13_7');
    assert.ok(xml.includes('<DoRozliczenia>500.00</DoRozliczenia>'), 'DoRozliczenia for negative');
  });

  it('sets P_18=2 and P_19=1 for VAT exempt', () => {
    const inv = makeInvoice({
      net_total: 500, vat_total: 0, gross_total: 500,
      items: [makeItem('zw', 500, 0, 500)],
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_18>2</P_18>'), 'P_18=2');
    assert.ok(xml.includes('<P_19>1</P_19>'), 'P_19=1');
  });
});

// ─── 2. 0% VAT Corrections ───────────────────────────────────────────────────

describe('Schema-driven FA(3) — 0% VAT corrections', () => {
  it('0% rate maps to P_13_5', () => {
    const inv = makeInvoice({
      net_total: 1000, vat_total: 0, gross_total: 1000,
      items: [makeItem('0', 1000, 0, 1000)],
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_13_5>1000.00</P_13_5>'), 'P_13_5 for 0%');
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.valid, `Should be valid: ${result.errors.map(e => e.message).join('; ')}`);
  });

  it('0 KR maps to P_13_6_1 with P_12="0 KR"', () => {
    const inv = makeInvoice({
      net_total: 1000, vat_total: 0, gross_total: 1000,
      items: [makeItem('0_kr', 1000, 0, 1000)],
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_13_6_1>1000.00</P_13_6_1>'), 'P_13_6_1');
    assert.ok(xml.includes('<P_12>0 KR</P_12>'), 'P_12=0 KR');
  });

  it('0 WDT maps to P_13_6_2', () => {
    const inv = makeInvoice({
      net_total: 500, vat_total: 0, gross_total: 500,
      items: [makeItem('0_wdt', 500, 0, 500)],
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_13_6_2>500.00</P_13_6_2>'), 'P_13_6_2');
  });

  it('0 EX maps to P_13_6_3', () => {
    const inv = makeInvoice({
      net_total: 300, vat_total: 0, gross_total: 300,
      items: [makeItem('0_ex', 300, 0, 300)],
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_13_6_3>300.00</P_13_6_3>'), 'P_13_6_3');
  });

  it('element order: P_13_5 before P_13_6_1 before P_13_7', () => {
    const inv = makeInvoice({
      net_total: 600, vat_total: 0, gross_total: 600,
      items: [
        makeItem('0', 100, 0, 100, 1),
        makeItem('0_kr', 200, 0, 200, 2),
        makeItem('zw', 300, 0, 300, 3),
      ],
    });
    const xml = buildFa2Xml(inv);
    const p5 = xml.indexOf('<P_13_5');
    const p6 = xml.indexOf('<P_13_6_1');
    const p7 = xml.indexOf('<P_13_7');
    assert.ok(p5 < p6, 'P_13_5 before P_13_6_1');
    assert.ok(p6 < p7, 'P_13_6_1 before P_13_7');
  });
});

// ─── 3. NP Corrections ────────────────────────────────────────────────────────

describe('Schema-driven FA(3) — NP corrections', () => {
  it('np I maps to P_13_8 with P_12="np I"', () => {
    const inv = makeInvoice({
      net_total: 200, vat_total: 0, gross_total: 200,
      items: [makeItem('np', 200, 0, 200)],
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_13_8>200.00</P_13_8>'), 'P_13_8');
    assert.ok(xml.includes('<P_12>np I</P_12>'), 'P_12=np I');
  });

  it('np II maps to P_13_8 with P_12="np II"', () => {
    const inv = makeInvoice({
      net_total: 150, vat_total: 0, gross_total: 150,
      items: [makeItem('np_ii', 150, 0, 150)],
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_13_8>150.00</P_13_8>'), 'P_13_8 for np_ii');
    assert.ok(xml.includes('<P_12>np II</P_12>'), 'P_12=np II');
  });

  it('aggregates np + np_ii into single P_13_8', () => {
    const inv = makeInvoice({
      net_total: 300, vat_total: 0, gross_total: 300,
      items: [
        makeItem('np', 180, 0, 180, 1),
        makeItem('np_ii', 120, 0, 120, 2),
      ],
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_13_8>300.00</P_13_8>'), 'Aggregated P_13_8 = 300');
    const count = (xml.match(/<P_13_8>/g) || []).length;
    assert.equal(count, 1, 'Only one P_13_8 element');
  });
});

// ─── 4. Reverse Charge Corrections ────────────────────────────────────────────

describe('Schema-driven FA(3) — reverse charge corrections', () => {
  it('oo maps to P_13_10 and sets P_18=1', () => {
    const inv = makeInvoice({
      net_total: 1000, vat_total: 0, gross_total: 1000,
      items: [makeItem('oo', 1000, 0, 1000)],
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_13_10>1000.00</P_13_10>'), 'P_13_10');
    assert.ok(xml.includes('<P_18>1</P_18>'), 'P_18=1 for reverse charge');
    assert.ok(xml.includes('<P_19N>1</P_19N>'), 'P_19N (not exempt)');
  });

  it('blocks zw + oo both positive (contradictory)', () => {
    const inv = makeInvoice({
      net_total: 1000, vat_total: 0, gross_total: 1000,
      items: [
        makeItem('zw', 500, 0, 500, 1),
        makeItem('oo', 500, 0, 500, 2),
      ],
    });
    const xml = buildFa2Xml(inv);
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.errors.some(e => e.rule === 'contradictory_vat_categories'), 'Must block contradictory');
  });

  it('allows oo reversal + zw new (category change)', () => {
    const inv = makeInvoice({
      net_total: 0, vat_total: 0, gross_total: 0,
      items: [
        makeItem('oo', -500, 0, -500, 1),
        makeItem('oo', 500, 0, 500, 2),
        makeItem('zw', 500, 0, 500, 3),
      ],
    });
    const xml = buildFa2Xml(inv);
    // oo nets to 0 (−500 + 500) → no P_13_10 emitted; zw is positive → P_13_7 emitted
    assert.ok(!xml.includes('<P_13_10'), 'No P_13_10 (oo netted to 0)');
    assert.ok(xml.includes('<P_13_7>500.00</P_13_7>'), 'P_13_7 for zw');
  });
});

// ─── 5. Mixed Category Corrections ────────────────────────────────────────────

describe('Schema-driven FA(3) — mixed category corrections', () => {
  it('multi-category reversal: 0 KR + np II → zw', () => {
    const inv = makeInvoice({
      net_total: -50, vat_total: 0, gross_total: -50,
      items: [
        makeItem('0_kr', -50, 0, -50, 1),
        makeItem('np_ii', -50, 0, -50, 2),
        makeItem('zw', 50, 0, 50, 3),
      ],
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_13_6_1>-50.00</P_13_6_1>'), 'P_13_6_1 for 0_kr reversal');
    assert.ok(xml.includes('<P_13_8>-50.00</P_13_8>'), 'P_13_8 for np_ii reversal');
    assert.ok(xml.includes('<P_13_7>50.00</P_13_7>'), 'P_13_7 for zw');
    assert.ok(!xml.includes('<P_13_9'), 'P_13_9 should not be emitted (conditional field)');
    assert.ok(xml.includes('<P_15>-50.00</P_15>'), 'P_15 = -50');
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.valid, `Should be valid: ${result.errors.map(e => e.message).join('; ')}`);
  });

  it('23% + 8% + 5% mixed rates produce correct P_13/P_14 pairs', () => {
    const inv = makeInvoice({
      net_total: 3000, vat_total: 360, gross_total: 3360,
      items: [
        makeItem('23', 1000, 230, 1230, 1),
        makeItem('8', 1000, 80, 1080, 2),
        makeItem('5', 1000, 50, 1050, 3),
      ],
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_13_1>'), 'P_13_1');
    assert.ok(xml.includes('<P_14_1>'), 'P_14_1');
    assert.ok(xml.includes('<P_13_2>'), 'P_13_2');
    assert.ok(xml.includes('<P_14_2>'), 'P_14_2');
    assert.ok(xml.includes('<P_13_3>'), 'P_13_3');
    assert.ok(xml.includes('<P_14_3>'), 'P_14_3');
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.valid, `Should be valid: ${result.errors.map(e => e.message).join('; ')}`);
  });

  it('passes full serializer pipeline for multi-category', () => {
    const inv = makeInvoice({
      net_total: -50, vat_total: 0, gross_total: -50,
      items: [
        makeItem('0_kr', -50, 0, -50, 1),
        makeItem('np_ii', -50, 0, -50, 2),
        makeItem('zw', 50, 0, 50, 3),
      ],
    });
    const result = serializeCorrectionInvoice(inv);
    assert.ok(result.valid, `Pipeline should pass: ${result.errors.map(e => e.message).join('; ')}`);
  });
});

// ─── 6. Mathematical Consistency ──────────────────────────────────────────────

describe('Schema-driven FA(3) — mathematical consistency', () => {
  it('P_15 = SUM(P_13_*) + SUM(P_14_*) for 23% invoice', () => {
    const inv = makeInvoice({
      net_total: 1000, vat_total: 230, gross_total: 1230,
      items: [makeItem('23', 1000, 230, 1230)],
    });
    const xml = buildFa2Xml(inv);
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.summaryCheck?.consistent, 'Summary consistent');
  });

  it('detects P_15 mismatch when gross_total is wrong', () => {
    const inv = makeInvoice({
      net_total: 1000, vat_total: 230, gross_total: 999,
      items: [makeItem('23', 1000, 230, 1230)],
    });
    const xml = buildFa2Xml(inv);
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.errors.some(e => e.rule === 'summary_gross_total_mismatch'), 'Must detect P_15 mismatch');
  });

  it('VAT summary engine computes P_15 from line items, not gross_total', () => {
    const summary = computeVatSummary([
      makeItem('23', 1000, 230, 1230),
    ]);
    assert.equal(summary.totalNet, 1000);
    assert.equal(summary.p15, 1230);
  });

  it('zero-net category is not emitted', () => {
    const summary = computeVatSummary([
      makeItem('oo', -500, 0, -500, 1),
      makeItem('oo', 500, 0, 500, 2),
      makeItem('zw', 500, 0, 500, 3),
    ]);
    // oo nets to 0 (−500 + 500) → should not be in active groups
    assert.ok(!summary.emittedP13Fields.includes('P_13_10'), 'No P_13_10 for zero-net oo');
    assert.ok(summary.emittedP13Fields.includes('P_13_7'), 'P_13_7 for zw');
  });
});

// ─── 7. Business Rule Validation ──────────────────────────────────────────────

describe('Schema-driven FA(3) — business rule validation', () => {
  it('blocks P_18=1 + P_19=1 coexistence', () => {
    const badXml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>1234567890</NIP><Nazwa>S</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>0987654321</NIP><Nazwa>B</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty><P_1>2026-10-28</P_1><P_2>FV/001</P_2>
    <P_13_7>500.00</P_13_7><P_13_9>500.00</P_13_9><P_15>500.00</P_15>
    <Adnotacje><P_16>2</P_16><P_17>2</P_17><P_18>1</P_18><P_18A>2</P_18A><Zwolnienie><P_19>1</P_19><P_19A>zw</P_19A></Zwolnienie></Adnotacje>
    <RodzajFaktury>KOR</RodzajFaktury><PrzyczynaKorekty>test</PrzyczynaKorekty>
    <DaneFaKorygowanej><DataWystFaKorygowanej>2026-09-20</DataWystFaKorygowanej><NrFaKorygowanej>FV/001</NrFaKorygowanej></DaneFaKorygowanej>
    <FaWiersz><NrWierszaFa>1</NrWierszaFa><P_7>T</P_7><P_8A>szt.</P_8A><P_8B>1.00</P_8B><P_9A>500.00</P_9A><P_11>500.00</P_11><P_12>zw</P_12></FaWiersz>
    <Rozliczenie><DoZaplaty>500.00</DoZaplaty></Rozliczenie><Platnosc><FormaPlatnosci>6</FormaPlatnosci></Platnosc>
  </Fa>
</Faktura>`;
    const inv = makeInvoice({ net_total: 500, vat_total: 0, gross_total: 500, items: [makeItem('zw', 500, 0, 500)] });
    const result = validateFa3Xml(badXml, inv);
    assert.ok(result.errors.some(e => e.rule === 'p18_p19_conflict'), 'Must block P_18+P_19 conflict');
  });

  it('blocks negative P_9A', () => {
    const badXml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>1234567890</NIP><Nazwa>S</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>0987654321</NIP><Nazwa>B</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty><P_1>2026-10-28</P_1><P_2>FV/001</P_2>
    <P_13_7>-500.00</P_13_7><P_13_9>-500.00</P_13_9><P_15>-500.00</P_15>
    <Adnotacje><P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A><Zwolnienie><P_19>1</P_19><P_19A>zw</P_19A></Zwolnienie></Adnotacje>
    <RodzajFaktury>KOR</RodzajFaktury><PrzyczynaKorekty>test</PrzyczynaKorekty>
    <DaneFaKorygowanej><DataWystFaKorygowanej>2026-09-20</DataWystFaKorygowanej><NrFaKorygowanej>FV/001</NrFaKorygowanej></DaneFaKorygowanej>
    <FaWiersz><NrWierszaFa>1</NrWierszaFa><P_7>T</P_7><P_8A>szt.</P_8A><P_8B>1.00</P_8B><P_9A>-500.00</P_9A><P_11>-500.00</P_11><P_12>zw</P_12></FaWiersz>
    <Rozliczenie><DoRozliczenia>500.00</DoRozliczenia></Rozliczenie><Platnosc><FormaPlatnosci>6</FormaPlatnosci></Platnosc>
  </Fa>
</Faktura>`;
    const inv = makeInvoice({ net_total: -500, vat_total: 0, gross_total: -500, items: [makeItem('zw', -500, 0, -500)] });
    const result = validateFa3Xml(badXml, inv);
    assert.ok(result.errors.some(e => e.rule === 'negative_p9a'), 'Must block negative P_9A');
  });

  it('blocks spurious P_13 fields for rates not in invoice', () => {
    const inv = makeInvoice({
      net_total: 500, vat_total: 0, gross_total: 500,
      items: [makeItem('zw', 500, 0, 500)],
    });
    const xml = buildFa2Xml(inv);
    assert.ok(!xml.includes('<P_13_1'), 'No P_13_1 for zw-only');
    assert.ok(!xml.includes('<P_13_8'), 'No P_13_8 for zw-only');
    assert.ok(!xml.includes('<P_13_10'), 'No P_13_10 for zw-only');
  });
});

// ─── 8. VAT Summary Engine ────────────────────────────────────────────────────

describe('Schema-driven FA(3) — VAT summary engine', () => {
  it('no hardcoded P_13 fields — only actual rates produce summary fields', () => {
    const summary = computeVatSummary([makeItem('23', 1000, 230, 1230)]);
    assert.deepEqual(summary.emittedP13Fields, ['P_13_1']);
    assert.deepEqual(summary.emittedP14Fields, ['P_14_1']);
  });

  it('buildVatSummaryXml produces correctly formatted lines', () => {
    const summary = computeVatSummary([makeItem('23', 1000, 230, 1230)]);
    const lines = buildVatSummaryXml(summary);
    assert.ok(lines.some(l => l.includes('<P_13_1>1000.00</P_13_1>')), 'P_13_1 line');
    assert.ok(lines.some(l => l.includes('<P_14_1>230.00</P_14_1>')), 'P_14_1 line');
    assert.ok(lines.some(l => l.includes('<P_15>1230.00</P_15>')), 'P_15 line');
    assert.ok(!lines.some(l => l.includes('<P_13_9')), 'No P_13_9 line (conditional field)');
  });

  it('detectedRates lists all categories from line items', () => {
    const summary = computeVatSummary([
      makeItem('23', 1000, 230, 1230, 1),
      makeItem('zw', 500, 0, 500, 2),
    ]);
    assert.ok(summary.detectedRates.includes('23'), 'Detected 23%');
    assert.ok(summary.detectedRates.includes('zw'), 'Detected zw');
  });
});

// ─── 9. Validation Report ─────────────────────────────────────────────────────

describe('Schema-driven FA(3) — validation report', () => {
  it('generates a ready report for valid invoice', () => {
    const inv = makeInvoice({
      document_type: 'INVOICE',
      net_total: 1000, vat_total: 230, gross_total: 1230,
      items: [makeItem('23', 1000, 230, 1230)],
    });
    const xml = buildFa2Xml(inv);
    const xmlVal = validateFa3Xml(xml, inv);
    const report = generateValidationReport(xml, inv, xmlVal);
    assert.equal(report.overallStatus, 'ready');
    assert.ok(report.readyForKsef);
    assert.ok(report.mathConsistent);
  });

  it('generates a blocked report for invalid invoice', () => {
    const inv = makeInvoice({
      net_total: 1000, vat_total: 230, gross_total: 999,
      items: [makeItem('23', 1000, 230, 1230)],
    });
    const xml = buildFa2Xml(inv);
    const xmlVal = validateFa3Xml(xml, inv);
    const report = generateValidationReport(xml, inv, xmlVal);
    assert.equal(report.overallStatus, 'blocked');
    assert.ok(!report.readyForKsef);
  });

  it('report includes all 6 validation sections', () => {
    const inv = makeInvoice({
      net_total: 500, vat_total: 0, gross_total: 500,
      items: [makeItem('zw', 500, 0, 500)],
    });
    const xml = buildFa2Xml(inv);
    const xmlVal = validateFa3Xml(xml, inv);
    const report = generateValidationReport(xml, inv, xmlVal);
    const sectionNames = report.sections.map(s => s.name);
    assert.ok(sectionNames.includes('Schema Validation'));
    assert.ok(sectionNames.includes('Business Validation'));
    assert.ok(sectionNames.includes('Mathematical Validation'));
    assert.ok(sectionNames.includes('Correction Validation'));
    assert.ok(sectionNames.includes('VAT Mapping Validation'));
    assert.ok(sectionNames.includes('Payment Validation'));
  });

  it('report includes detected VAT categories and emitted fields', () => {
    const inv = makeInvoice({
      net_total: -50, vat_total: 0, gross_total: -50,
      items: [
        makeItem('0_kr', -50, 0, -50, 1),
        makeItem('np_ii', -50, 0, -50, 2),
        makeItem('zw', 50, 0, 50, 3),
      ],
    });
    const xml = buildFa2Xml(inv);
    const xmlVal = validateFa3Xml(xml, inv);
    const report = generateValidationReport(xml, inv, xmlVal);
    assert.ok(report.detectedVatCategories.includes('0_kr'), 'Detected 0_kr');
    assert.ok(report.detectedVatCategories.includes('np'), 'Detected np (aggregated from np_ii)');
    assert.ok(report.emittedP13Fields.includes('P_13_6_1'), 'Emitted P_13_6_1');
    assert.ok(report.emittedP13Fields.includes('P_13_8'), 'Emitted P_13_8');
    assert.ok(report.emittedP13Fields.includes('P_13_7'), 'Emitted P_13_7');
  });
});

// ─── 10. Schema Definition ────────────────────────────────────────────────────

describe('Schema-driven FA(3) — schema definition', () => {
  it('P_13_9 comes after P_13_8 in the sequence', () => {
    assert.ok(faElementPosition('P_13_8') < faElementPosition('P_13_9'), 'P_13_8 before P_13_9');
  });

  it('P_15 comes after P_13_9', () => {
    assert.ok(faElementPosition('P_13_9') < faElementPosition('P_15'), 'P_13_9 before P_15');
  });

  it('Adnotacje comes after P_15', () => {
    assert.ok(faElementPosition('P_15') < faElementPosition('Adnotacje'), 'P_15 before Adnotacje');
  });

  it('RodzajFaktury comes after Adnotacje', () => {
    assert.ok(faElementPosition('Adnotacje') < faElementPosition('RodzajFaktury'), 'Adnotacje before RodzajFaktury');
  });

  it('FaWiersz comes after DaneFaKorygowanej', () => {
    assert.ok(faElementPosition('DaneFaKorygowanej') < faElementPosition('FaWiersz'), 'DaneFaKorygowanej before FaWiersz');
  });

  it('perRateP13Elements returns unique elements in order', () => {
    const elems = perRateP13Elements();
    // Should not include P_13_9 (conditional field, not per-rate)
    assert.ok(!elems.includes('P_13_9'), 'No P_13_9 in per-rate');
    // Should be in ascending order
    for (let i = 1; i < elems.length; i++) {
      assert.ok(faElementPosition(elems[i - 1]) < faElementPosition(elems[i]), `${elems[i-1]} before ${elems[i]}`);
    }
  });

  it('np_ii aggregatesWith np in schema definition', () => {
    assert.equal(P13_FIELDS['np_ii'].aggregatesWith, 'np');
    assert.equal(P13_FIELDS['np_ii'].element, P13_FIELDS['np'].element, 'np and np_ii share element');
  });
});
