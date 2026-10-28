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

function makeCorrection(overrides: Partial<IssuedInvoiceWithItems> = {}): IssuedInvoiceWithItems {
  return makeInvoice({
    document_type: 'CORRECTION',
    invoice_number: 'FK/2026/10/001',
    corrected_invoice_number: 'FV/2026/09/001',
    corrected_invoice_date: '2026-09-20',
    corrected_invoice_ksef_no: 'KSeF-2026-09-001',
    correction_reason: 'Korekta wartości',
    ...overrides,
  });
}

// ─── Correction Type Detection ────────────────────────────────────────────────

describe('Correction serializer — type detection', () => {
  it('detects VAT classification change when multiple rates present', () => {
    const inv = makeCorrection({
      net_total: 0, vat_total: 0, gross_total: 0,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Reversal', unit: 'szt.',
          quantity: -1, unit_price_net: 1000, vat_rate: 'oo',
          net_amount: -1000, vat_amount: 0, gross_amount: -1000, discount_pct: null },
        { id: 'b', invoice_id: 'x', position: 2, name: 'New', unit: 'szt.',
          quantity: 1, unit_price_net: 1000, vat_rate: 'zw',
          net_amount: 1000, vat_amount: 0, gross_amount: 1000, discount_pct: null },
      ] as never,
    });
    const info = detectCorrectionType(inv);
    assert.equal(info.type, 'vat_classification');
  });

  it('detects value correction when same rate with reversal + new', () => {
    const inv = makeCorrection({
      net_total: 200, vat_total: 46, gross_total: 246,
      correction_reason: 'Korekta ceny',
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Reversal', unit: 'szt.',
          quantity: -1, unit_price_net: 1000, vat_rate: '23',
          net_amount: -1000, vat_amount: -230, gross_amount: -1230, discount_pct: null },
        { id: 'b', invoice_id: 'x', position: 2, name: 'New value', unit: 'szt.',
          quantity: 1, unit_price_net: 1200, vat_rate: '23',
          net_amount: 1200, vat_amount: 276, gross_amount: 1476, discount_pct: null },
      ] as never,
    });
    const info = detectCorrectionType(inv);
    assert.equal(info.type, 'value');
  });

  it('detects quantity correction from reason text', () => {
    const inv = makeCorrection({
      net_total: -100, vat_total: -23, gross_total: -123,
      correction_reason: 'Korekta ilości towaru',
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Reversal', unit: 'szt.',
          quantity: -1, unit_price_net: 1000, vat_rate: '23',
          net_amount: -1000, vat_amount: -230, gross_amount: -1230, discount_pct: null },
        { id: 'b', invoice_id: 'x', position: 2, name: 'Corrected qty', unit: 'szt.',
          quantity: 1, unit_price_net: 900, vat_rate: '23',
          net_amount: 900, vat_amount: 207, gross_amount: 1107, discount_pct: null },
      ] as never,
    });
    const info = detectCorrectionType(inv);
    assert.equal(info.type, 'quantity');
  });

  it('detects customer data correction from reason text', () => {
    const inv = makeCorrection({
      net_total: 0, vat_total: 0, gross_total: 0,
      correction_reason: 'Korekta danych nabywcy — błędny NIP',
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'No change', unit: 'szt.',
          quantity: 1, unit_price_net: 0, vat_rate: 'zw',
          net_amount: 0, vat_amount: 0, gross_amount: 0, discount_pct: null },
      ] as never,
    });
    const info = detectCorrectionType(inv);
    assert.equal(info.type, 'customer_data');
  });
});

// ─── 3-Stage Validation Pipeline ──────────────────────────────────────────────

describe('Correction serializer — 3-stage pipeline', () => {
  it('passes all 3 stages for a valid VAT classification correction', () => {
    const inv = makeCorrection({
      net_total: 0, vat_total: 0, gross_total: 0,
      correction_reason: 'Zmiana stawki VAT z oo na zw',
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Reversal oo', unit: 'szt.',
          quantity: -1, unit_price_net: 1000, vat_rate: 'oo',
          net_amount: -1000, vat_amount: 0, gross_amount: -1000, discount_pct: null },
        { id: 'b', invoice_id: 'x', position: 2, name: 'New zw', unit: 'szt.',
          quantity: 1, unit_price_net: 1000, vat_rate: 'zw',
          net_amount: 1000, vat_amount: 0, gross_amount: 1000, discount_pct: null },
      ] as never,
    });
    const result = serializeCorrectionInvoice(inv);
    assert.ok(result.valid, `Should be valid: ${result.errors.map(e => e.message).join('; ')}`);
    assert.ok(result.rawXml, 'XML should be generated');
    assert.ok(result.xmlValidation, 'XML validation should run');
    assert.equal(result.correctionType.type, 'vat_classification');
  });

  it('fails at stage 1 when corrected_invoice_number is missing', () => {
    const inv = makeCorrection({
      corrected_invoice_number: '',
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Test', unit: 'szt.',
          quantity: 1, unit_price_net: 100, vat_rate: '23',
          net_amount: 100, vat_amount: 23, gross_amount: 123, discount_pct: null },
      ] as never,
    });
    const result = serializeCorrectionInvoice(inv);
    assert.ok(!result.valid, 'Should fail');
    assert.ok(result.errors.some(e => e.rule === 'missing_corrected_invoice_number'));
    assert.ok(!result.rawXml, 'XML should NOT be generated when stage 1 fails');
  });

  it('fails at stage 1 when corrected_invoice_date is missing', () => {
    const inv = makeCorrection({
      corrected_invoice_date: '',
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Test', unit: 'szt.',
          quantity: 1, unit_price_net: 100, vat_rate: '23',
          net_amount: 100, vat_amount: 23, gross_amount: 123, discount_pct: null },
      ] as never,
    });
    const result = serializeCorrectionInvoice(inv);
    assert.ok(!result.valid, 'Should fail');
    assert.ok(result.errors.some(e => e.rule === 'missing_corrected_invoice_date'));
  });

  it('warns at stage 1 when correction_reason is missing', () => {
    const inv = makeCorrection({
      correction_reason: '',
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Test', unit: 'szt.',
          quantity: 1, unit_price_net: 100, vat_rate: '23',
          net_amount: 100, vat_amount: 23, gross_amount: 123, discount_pct: null },
      ] as never,
    });
    const result = serializeCorrectionInvoice(inv);
    assert.ok(result.warnings.some(w => w.rule === 'missing_correction_reason'));
  });

  it('fails at stage 1 when no line items', () => {
    const inv = makeCorrection({ items: [] as never });
    const result = serializeCorrectionInvoice(inv);
    assert.ok(!result.valid, 'Should fail');
    assert.ok(result.errors.some(e => e.rule === 'no_line_items'));
  });
});

// ─── Original Invoice Reference (DaneFaKorygowanej) ───────────────────────────

describe('Correction serializer — original invoice references', () => {
  it('generates DaneFaKorygowanej with DataWystFaKorygowanej + NrFaKorygowanej', () => {
    const inv = makeCorrection({
      net_total: -100, vat_total: -23, gross_total: -123,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta', unit: 'szt.',
          quantity: -1, unit_price_net: 100, vat_rate: '23',
          net_amount: -100, vat_amount: -23, gross_amount: -123, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<DaneFaKorygowanej>'), 'Must include DaneFaKorygowanej');
    assert.ok(xml.includes('<DataWystFaKorygowanej>2026-09-20</DataWystFaKorygowanej>'), 'Must include original date');
    assert.ok(xml.includes('<NrFaKorygowanej>FV/2026/09/001</NrFaKorygowanej>'), 'Must include original number');
  });

  it('includes NrKSeF + NrKSeFFaKorygowanej when corrected_invoice_ksef_no is available', () => {
    const inv = makeCorrection({
      corrected_invoice_ksef_no: 'KSeF-2026-09-001',
      net_total: -100, vat_total: -23, gross_total: -123,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta', unit: 'szt.',
          quantity: -1, unit_price_net: 100, vat_rate: '23',
          net_amount: -100, vat_amount: -23, gross_amount: -123, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<NrKSeF>1</NrKSeF>'), 'Must include NrKSeF=1 marker');
    assert.ok(xml.includes('<NrKSeFFaKorygowanej>KSeF-2026-09-001</NrKSeFFaKorygowanej>'), 'Must include NrKSeFFaKorygowanej with KSeF number');
    assert.ok(!xml.includes('<NrKSeFN'), 'NrKSeFN must not appear when KSeF number is available');
  });

  it('emits NrKSeFN=1 when corrected_invoice_ksef_no is not available (original outside KSeF)', () => {
    const inv = makeCorrection({
      corrected_invoice_ksef_no: null,
      net_total: -100, vat_total: -23, gross_total: -123,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta', unit: 'szt.',
          quantity: -1, unit_price_net: 100, vat_rate: '23',
          net_amount: -100, vat_amount: -23, gross_amount: -123, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<NrKSeFN>1</NrKSeFN>'), 'Must include NrKSeFN=1 when original was outside KSeF');
    assert.ok(!xml.includes('<NrKSeFFaKorygowanej'), 'NrKSeFFaKorygowanej must not appear without KSeF number');
  });

  it('validator rejects correction without DaneFaKorygowanej', () => {
    const inv = makeCorrection({
      net_total: -100, vat_total: -23, gross_total: -123,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta', unit: 'szt.',
          quantity: -1, unit_price_net: 100, vat_rate: '23',
          net_amount: -100, vat_amount: -23, gross_amount: -123, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv).replace(/<DaneFaKorygowanej>[\s\S]*?<\/DaneFaKorygowanej>/, '');
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.errors.some(e => e.rule === 'missing_corrected_invoice_ref'));
  });

  it('validator rejects correction with invalid original date format', () => {
    const inv = makeCorrection({
      corrected_invoice_date: '20-09-2026', // wrong format
      net_total: -100, vat_total: -23, gross_total: -123,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta', unit: 'szt.',
          quantity: -1, unit_price_net: 100, vat_rate: '23',
          net_amount: -100, vat_amount: -23, gross_amount: -123, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.errors.some(e => e.rule === 'invalid_corrected_invoice_date'));
  });
});

// ─── Payment Section ──────────────────────────────────────────────────────────

describe('Correction serializer — payment section', () => {
  it('generates TerminPlatnosci with valid due date', () => {
    const inv = makeCorrection({
      due_date: '2026-10-30',
      net_total: -100, vat_total: -23, gross_total: -123,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta', unit: 'szt.',
          quantity: -1, unit_price_net: 100, vat_rate: '23',
          net_amount: -100, vat_amount: -23, gross_amount: -123, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<TerminPlatnosci>'), 'Must include TerminPlatnosci');
    assert.ok(xml.includes('<Termin>2026-10-30</Termin>'), 'Must include due date');
  });

  it('generates FormaPlatnosci with valid payment method code', () => {
    const inv = makeCorrection({
      payment_method: 'transfer',
      net_total: -100, vat_total: -23, gross_total: -123,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta', unit: 'szt.',
          quantity: -1, unit_price_net: 100, vat_rate: '23',
          net_amount: -100, vat_amount: -23, gross_amount: -123, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<FormaPlatnosci>6</FormaPlatnosci>'), 'Transfer must map to code 6');
  });

  it('generates RachunekBankowy when bank account is present', () => {
    const inv = makeCorrection({
      seller_bank_account: 'PL02105010251000009083947912',
      net_total: -100, vat_total: -23, gross_total: -123,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta', unit: 'szt.',
          quantity: -1, unit_price_net: 100, vat_rate: '23',
          net_amount: -100, vat_amount: -23, gross_amount: -123, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<RachunekBankowy>'), 'Must include RachunekBankowy');
    assert.ok(xml.includes('<NrRB>'), 'Must include NrRB');
  });

  it('validator rejects invalid due date format', () => {
    const inv = makeCorrection({
      due_date: '2026/10/30', // wrong format
      net_total: -100, vat_total: -23, gross_total: -123,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta', unit: 'szt.',
          quantity: -1, unit_price_net: 100, vat_rate: '23',
          net_amount: -100, vat_amount: -23, gross_amount: -123, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.errors.some(e => e.rule === 'invalid_due_date'));
  });
});

// ─── Settlement Section (Rozliczenie) ─────────────────────────────────────────

describe('Correction serializer — settlement section', () => {
  it('generates DoZaplaty when gross_total is positive', () => {
    const inv = makeCorrection({
      net_total: 200, vat_total: 46, gross_total: 246,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta+', unit: 'szt.',
          quantity: 1, unit_price_net: 200, vat_rate: '23',
          net_amount: 200, vat_amount: 46, gross_amount: 246, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<DoZaplaty>246.00</DoZaplaty>'), 'Must include DoZaplaty with gross amount');
  });

  it('generates DoRozliczenia when gross_total is negative', () => {
    const inv = makeCorrection({
      net_total: -200, vat_total: -46, gross_total: -246,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta-', unit: 'szt.',
          quantity: -1, unit_price_net: 200, vat_rate: '23',
          net_amount: -200, vat_amount: -46, gross_amount: -246, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<DoRozliczenia>246.00</DoRozliczenia>'), 'Must include DoRozliczenia with |gross| amount');
  });

  it('validator catches DoZaplaty not matching P_15', () => {
    const inv = makeCorrection({
      net_total: 200, vat_total: 46, gross_total: 246,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta+', unit: 'szt.',
          quantity: 1, unit_price_net: 200, vat_rate: '23',
          net_amount: 200, vat_amount: 46, gross_amount: 246, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv).replace('<DoZaplaty>246.00</DoZaplaty>', '<DoZaplaty>999.00</DoZaplaty>');
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.errors.some(e => e.rule === 'rozliczenie_mismatch'), 'Should detect DoZaplaty mismatch');
  });

  it('validator catches DoRozliczenia not matching |P_15|', () => {
    const inv = makeCorrection({
      net_total: -200, vat_total: -46, gross_total: -246,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta-', unit: 'szt.',
          quantity: -1, unit_price_net: 200, vat_rate: '23',
          net_amount: -200, vat_amount: -46, gross_amount: -246, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv).replace('<DoRozliczenia>246.00</DoRozliczenia>', '<DoRozliczenia>100.00</DoRozliczenia>');
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.errors.some(e => e.rule === 'rozliczenie_mismatch'), 'Should detect DoRozliczenia mismatch');
  });

  it('Rozliczenie comes after FaWiersz in XML order', () => {
    const inv = makeCorrection({
      net_total: -100, vat_total: -23, gross_total: -123,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta', unit: 'szt.',
          quantity: -1, unit_price_net: 100, vat_rate: '23',
          net_amount: -100, vat_amount: -23, gross_amount: -123, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    const faWierszPos = xml.indexOf('<FaWiersz');
    const rozliczeniePos = xml.indexOf('<Rozliczenie');
    assert.ok(faWierszPos > -1 && rozliczeniePos > -1);
    assert.ok(faWierszPos < rozliczeniePos, 'Rozliczenie must come after FaWiersz');
  });
});

// ─── Unit Price (P_9A) Never Negative ─────────────────────────────────────────

describe('Correction serializer — unit price rules', () => {
  it('P_9A is always positive even when unit_price_net is negative', () => {
    const inv = makeCorrection({
      net_total: -100, vat_total: -23, gross_total: -123,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta', unit: 'szt.',
          quantity: -1, unit_price_net: -100, vat_rate: '23',
          net_amount: -100, vat_amount: -23, gross_amount: -123, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    assert.ok(!xml.includes('<P_9A>-'), 'P_9A must never be negative');
    assert.ok(xml.includes('<P_9A>100.00</P_9A>'), 'P_9A should be abs value 100.00');
  });

  it('P_9A is positive for positive unit prices', () => {
    const inv = makeCorrection({
      net_total: 200, vat_total: 46, gross_total: 246,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'New', unit: 'szt.',
          quantity: 1, unit_price_net: 200, vat_rate: '23',
          net_amount: 200, vat_amount: 46, gross_amount: 246, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_9A>200.00</P_9A>'), 'P_9A should be 200.00');
  });
});

// ─── Summary Validation: SUM(P_13) = P_15 ─────────────────────────────────────

describe('Correction serializer — summary validation', () => {
  it('SUM(P_13_*) = P_15 for a value correction', () => {
    const inv = makeCorrection({
      net_total: 200, vat_total: 46, gross_total: 246,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Reversal', unit: 'szt.',
          quantity: -1, unit_price_net: 1000, vat_rate: '23',
          net_amount: -1000, vat_amount: -230, gross_amount: -1230, discount_pct: null },
        { id: 'b', invoice_id: 'x', position: 2, name: 'New', unit: 'szt.',
          quantity: 1, unit_price_net: 1200, vat_rate: '23',
          net_amount: 1200, vat_amount: 276, gross_amount: 1476, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    const result = validateFa3Xml(xml, inv);
    assert.ok(result.summaryCheck?.consistent, `Summary should be consistent: ${JSON.stringify(result.summaryCheck)}`);
  });

  it('P_13 fields are generated dynamically from actual VAT categories', () => {
    const inv = makeCorrection({
      net_total: 0, vat_total: 0, gross_total: 0,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Reversal 23%', unit: 'szt.',
          quantity: -1, unit_price_net: 500, vat_rate: '23',
          net_amount: -500, vat_amount: -115, gross_amount: -615, discount_pct: null },
        { id: 'b', invoice_id: 'x', position: 2, name: 'New 8%', unit: 'szt.',
          quantity: 1, unit_price_net: 500, vat_rate: '8',
          net_amount: 500, vat_amount: 40, gross_amount: 540, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    // 23% reversal → P_13_1 with negative value
    assert.ok(xml.includes('<P_13_1>'), 'P_13_1 must be present for 23% rate');
    // 8% new → P_13_2 with positive value
    assert.ok(xml.includes('<P_13_2>'), 'P_13_2 must be present for 8% rate');
    // No P_13_7, P_13_8, P_13_10 (zw, np, oo not used)
    assert.ok(!xml.includes('<P_13_7>'), 'P_13_7 should not appear');
    assert.ok(!xml.includes('<P_13_8>'), 'P_13_8 should not appear');
    assert.ok(!xml.includes('<P_13_10>'), 'P_13_10 should not appear');
  });

  it('no hardcoded P_13 fields — only actual rates produce summary fields', () => {
    const inv = makeCorrection({
      net_total: 500, vat_total: 0, gross_total: 500,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'zw only', unit: 'szt.',
          quantity: 1, unit_price_net: 500, vat_rate: 'zw',
          net_amount: 500, vat_amount: 0, gross_amount: 500, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<P_13_7>'), 'P_13_7 must be present for zw');
    assert.ok(!xml.includes('<P_13_1>'), 'P_13_1 should not appear for zw-only');
    assert.ok(!xml.includes('<P_13_2>'), 'P_13_2 should not appear for zw-only');
    assert.ok(!xml.includes('<P_13_3>'), 'P_13_3 should not appear for zw-only');
    assert.ok(!xml.includes('<P_13_5>'), 'P_13_5 should not appear for zw-only');
    assert.ok(!xml.includes('<P_13_8>'), 'P_13_8 should not appear for zw-only');
    assert.ok(!xml.includes('<P_13_10>'), 'P_13_10 should not appear for zw-only');
  });
});

// ─── Business Rule: Contradictory VAT Categories ──────────────────────────────

describe('Correction serializer — business rule validation', () => {
  it('prevents VAT exempt + reverse charge from both being positive', () => {
    const badXml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>1234567890</NIP><Nazwa>Seller</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>0987654321</NIP><Nazwa>Buyer</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-09-20</P_1>
    <P_2>FV/001</P_2>
    <P_13_7>1000.00</P_13_7>
    <P_13_10>500.00</P_13_10>
    <P_13_9>1500.00</P_13_9>
    <P_15>1500.00</P_15>
    <Adnotacje><P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A><Zwolnienie><P_19>1</P_19><P_19A>zwolnienie</P_19A></Zwolnienie></Adnotacje>
    <RodzajFaktury>KOR</RodzajFaktury>
    <PrzyczynaKorekty>test</PrzyczynaKorekty>
    <DaneFaKorygowanej><DataWystFaKorygowanej>2026-09-20</DataWystFaKorygowanej><NrFaKorygowanej>FV/001</NrFaKorygowanej></DaneFaKorygowanej>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Test</P_7>
      <P_8A>szt.</P_8A>
      <P_8B>1.0000</P_8B>
      <P_9A>1000.00</P_9A>
      <P_11>1000.00</P_11>
      <P_12>zw</P_12>
    </FaWiersz>
    <Rozliczenie><DoZaplaty>1500.00</DoZaplaty></Rozliczenie>
    <Platnosc><FormaPlatnosci>6</FormaPlatnosci></Platnosc>
  </Fa>
</Faktura>`;
    const inv = makeCorrection({
      net_total: 1500, vat_total: 0, gross_total: 1500,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'ZW', unit: 'szt.',
          quantity: 1, unit_price_net: 1000, vat_rate: 'zw',
          net_amount: 1000, vat_amount: 0, gross_amount: 1000, discount_pct: null },
        { id: 'b', invoice_id: 'x', position: 2, name: 'OO', unit: 'szt.',
          quantity: 1, unit_price_net: 500, vat_rate: 'oo',
          net_amount: 500, vat_amount: 0, gross_amount: 500, discount_pct: null },
      ] as never,
    });
    const result = validateFa3Xml(badXml, inv);
    assert.ok(result.errors.some(e => e.rule === 'contradictory_vat_categories'));
  });

  it('P_18=1 and P_19=1 coexistence is blocked', () => {
    const badXml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>1234567890</NIP><Nazwa>Seller</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>0987654321</NIP><Nazwa>Buyer</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-09-20</P_1>
    <P_2>FV/001</P_2>
    <P_13_7>1000.00</P_13_7>
    <P_13_9>1000.00</P_13_9>
    <P_15>1000.00</P_15>
    <Adnotacje><P_16>2</P_16><P_17>2</P_17><P_18>1</P_18><P_18A>2</P_18A><Zwolnienie><P_19>1</P_19><P_19A>zwolnienie</P_19A></Zwolnienie></Adnotacje>
    <RodzajFaktury>KOR</RodzajFaktury>
    <PrzyczynaKorekty>test</PrzyczynaKorekty>
    <DaneFaKorygowanej><DataWystFaKorygowanej>2026-09-20</DataWystFaKorygowanej><NrFaKorygowanej>FV/001</NrFaKorygowanej></DaneFaKorygowanej>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Test</P_7>
      <P_8A>szt.</P_8A>
      <P_8B>1.0000</P_8B>
      <P_9A>1000.00</P_9A>
      <P_11>1000.00</P_11>
      <P_12>zw</P_12>
    </FaWiersz>
    <Rozliczenie><DoZaplaty>1000.00</DoZaplaty></Rozliczenie>
    <Platnosc><FormaPlatnosci>6</FormaPlatnosci></Platnosc>
  </Fa>
</Faktura>`;
    const inv = makeCorrection({
      net_total: 1000, vat_total: 0, gross_total: 1000,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'ZW', unit: 'szt.',
          quantity: 1, unit_price_net: 1000, vat_rate: 'zw',
          net_amount: 1000, vat_amount: 0, gross_amount: 1000, discount_pct: null },
      ] as never,
    });
    const result = validateFa3Xml(badXml, inv);
    assert.ok(result.errors.some(e => e.rule === 'p18_p19_conflict'));
  });

  it('zero-value P_13 fields are detected', () => {
    const badXml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>1234567890</NIP><Nazwa>Seller</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>0987654321</NIP><Nazwa>Buyer</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-09-20</P_1>
    <P_2>FV/001</P_2>
    <P_13_7>1000.00</P_13_7>
    <P_13_10>0.00</P_13_10>
    <P_13_9>1000.00</P_13_9>
    <P_15>1000.00</P_15>
    <Adnotacje><P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A><Zwolnienie><P_19>1</P_19><P_19A>zwolnienie</P_19A></Zwolnienie></Adnotacje>
    <RodzajFaktury>KOR</RodzajFaktury>
    <PrzyczynaKorekty>test</PrzyczynaKorekty>
    <DaneFaKorygowanej><DataWystFaKorygowanej>2026-09-20</DataWystFaKorygowanej><NrFaKorygowanej>FV/001</NrFaKorygowanej></DaneFaKorygowanej>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Test</P_7>
      <P_8A>szt.</P_8A>
      <P_8B>1.0000</P_8B>
      <P_9A>1000.00</P_9A>
      <P_11>1000.00</P_11>
      <P_12>zw</P_12>
    </FaWiersz>
    <Rozliczenie><DoZaplaty>1000.00</DoZaplaty></Rozliczenie>
    <Platnosc><FormaPlatnosci>6</FormaPlatnosci></Platnosc>
  </Fa>
</Faktura>`;
    const inv = makeCorrection({
      net_total: 1000, vat_total: 0, gross_total: 1000,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'ZW', unit: 'szt.',
          quantity: 1, unit_price_net: 1000, vat_rate: 'zw',
          net_amount: 1000, vat_amount: 0, gross_amount: 1000, discount_pct: null },
      ] as never,
    });
    const result = validateFa3Xml(badXml, inv);
    assert.ok(result.errors.some(e => e.rule === 'zero_value_p13_field' && e.element === 'P_13_10'));
  });
});

// ─── FA(3) Structure: Element Ordering ────────────────────────────────────────

describe('Correction serializer — FA(3) structure ordering', () => {
  it('correct element order: Naglowek → Podmiot1 → Podmiot2 → Fa', () => {
    const inv = makeCorrection({
      net_total: -100, vat_total: -23, gross_total: -123,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta', unit: 'szt.',
          quantity: -1, unit_price_net: 100, vat_rate: '23',
          net_amount: -100, vat_amount: -23, gross_amount: -123, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    const naglowekPos = xml.indexOf('<Naglowek');
    const podmiot1Pos = xml.indexOf('<Podmiot1');
    const podmiot2Pos = xml.indexOf('<Podmiot2');
    const faPos = xml.indexOf('<Fa>');
    assert.ok(naglowekPos < podmiot1Pos, 'Naglowek before Podmiot1');
    assert.ok(podmiot1Pos < podmiot2Pos, 'Podmiot1 before Podmiot2');
    assert.ok(podmiot2Pos < faPos, 'Podmiot2 before Fa');
  });

  it('correct Fa order: summary → Adnotacje → RodzajFaktury → PrzyczynaKorekty → DaneFaKorygowanej → FaWiersz → Rozliczenie → Platnosc', () => {
    const inv = makeCorrection({
      net_total: -100, vat_total: -23, gross_total: -123,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta', unit: 'szt.',
          quantity: -1, unit_price_net: 100, vat_rate: '23',
          net_amount: -100, vat_amount: -23, gross_amount: -123, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    const p15Pos = xml.indexOf('<P_15');
    const adnotacjePos = xml.indexOf('<Adnotacje');
    const rodzajPos = xml.indexOf('<RodzajFaktury');
    const przyczynaPos = xml.indexOf('<PrzyczynaKorekty');
    const danePos = xml.indexOf('<DaneFaKorygowanej');
    const faWierszPos = xml.indexOf('<FaWiersz');
    const rozliczeniePos = xml.indexOf('<Rozliczenie');
    const platnoscPos = xml.indexOf('<Platnosc');

    assert.ok(p15Pos < adnotacjePos, 'P_15 before Adnotacje');
    assert.ok(adnotacjePos < rodzajPos, 'Adnotacje before RodzajFaktury');
    assert.ok(rodzajPos < przyczynaPos, 'RodzajFaktury before PrzyczynaKorekty');
    assert.ok(przyczynaPos < danePos, 'PrzyczynaKorekty before DaneFaKorygowanej');
    assert.ok(danePos < faWierszPos, 'DaneFaKorygowanej before FaWiersz');
    assert.ok(faWierszPos < rozliczeniePos, 'FaWiersz before Rozliczenie');
    assert.ok(rozliczeniePos < platnoscPos, 'Rozliczenie before Platnosc');
  });

  it('RodzajFaktury is KOR for correction invoices', () => {
    const inv = makeCorrection({
      net_total: -100, vat_total: -23, gross_total: -123,
      items: [
        { id: 'a', invoice_id: 'x', position: 1, name: 'Korekta', unit: 'szt.',
          quantity: -1, unit_price_net: 100, vat_rate: '23',
          net_amount: -100, vat_amount: -23, gross_amount: -123, discount_pct: null },
      ] as never,
    });
    const xml = buildFa2Xml(inv);
    assert.ok(xml.includes('<RodzajFaktury>KOR</RodzajFaktury>'), 'Must use KOR for corrections');
  });
});
