import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFa2Xml } from '../../ksef/xml-builder';
import type { IssuedInvoiceWithItems } from '../../../types/issued-invoice';

function makeInvoice(overrides: Partial<IssuedInvoiceWithItems> = {}): IssuedInvoiceWithItems {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    company_id: '00000000-0000-0000-0000-000000000002',
    invoice_number: 'FV/2026/10/001',
    numbering_mode: 'automatic',
    status: 'issued',
    document_type: 'STANDARD',
    currency: 'PLN',
    issue_date: '2026-10-15',
    sale_date: null,
    due_date: '2026-10-30',
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
    original_invoice_id: null,
    correction_reason: null,
    corrected_invoice_number: null,
    corrected_invoice_date: null,
    advance_amount: null,
    order_total_gross: null,
    remaining_amount: null,
    settlement_of_invoice_id: null,
    total_advances_amount: null,
    amount_due: null,
    ksef_reference_no: null,
    ksef_session_token: null,
    ksef_status: null,
    ksef_error_message: null,
    ksef_sent_at: null,
    ksef_accepted_at: null,
    buyer_company_id: null,
    created_by: null,
    billing_address_snapshot: null,
    billing_address_source: null,
    billing_address_last_synced_at: null,
    created_at: '2026-10-15T10:00:00Z',
    updated_at: '2026-10-15T10:00:00Z',
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
      created_at: '2026-10-15T10:00:00Z',
    }],
    ...overrides,
  } as unknown as IssuedInvoiceWithItems;
}

// ─── STANDARD invoices (regression) ───────────────────────────────────────────

describe('KSeF XML builder — STANDARD document type', () => {
  it('uses RodzajFaktury VAT for STANDARD invoices', () => {
    const xml = buildFa2Xml(makeInvoice());
    assert.ok(xml.includes('<RodzajFaktury>VAT</RodzajFaktury>'), 'STANDARD must use VAT');
  });

  it('does not include FakturaKorygowana for STANDARD invoices', () => {
    const xml = buildFa2Xml(makeInvoice());
    assert.ok(!xml.includes('FakturaKorygowana'), 'STANDARD must not have FakturaKorygowana');
  });
});

// ─── CORRECTION invoices ──────────────────────────────────────────────────────

describe('KSeF XML builder — CORRECTION document type', () => {
  const correctionInvoice = makeInvoice({
    document_type: 'CORRECTION',
    invoice_number: 'FK/2026/10/001',
    original_invoice_id: '00000000-0000-0000-0000-000000000009',
    corrected_invoice_number: 'FV/2026/09/005',
    corrected_invoice_date: '2026-09-20',
    correction_reason: 'Zwrot towaru - błędna ilość',
    net_total: 900,
    vat_total: 207,
    gross_total: 1107,
    items: [{
      id: '00000000-0000-0000-0000-000000000010',
      invoice_id: '00000000-0000-0000-0000-000000000001',
      position: 1,
      name: 'Usługa testowa (korekcja)',
      unit: 'szt.',
      quantity: 0.9,
      unit_price_net: 1000,
      vat_rate: '23',
      net_amount: 900,
      vat_amount: 207,
      gross_amount: 1107,
      discount_pct: null,
      created_at: '2026-10-15T10:00:00Z',
    }],
  });

  it('uses RodzajFaktury KOR for CORRECTION invoices', () => {
    const xml = buildFa2Xml(correctionInvoice);
    assert.ok(xml.includes('<RodzajFaktury>KOR</RodzajFaktury>'), 'CORRECTION must use KOR');
  });

  it('includes FakturaKorygowana with original invoice number', () => {
    const xml = buildFa2Xml(correctionInvoice);
    assert.ok(xml.includes('<FakturaKorygowana>'), 'must include FakturaKorygowana');
    assert.ok(xml.includes('<P_2K>FV/2026/09/005</P_2K>'), 'must include original invoice number');
  });

  it('includes original invoice date in P_1K', () => {
    const xml = buildFa2Xml(correctionInvoice);
    assert.ok(xml.includes('<P_1K>2026-09-20</P_1K>'), 'must include original invoice date');
  });

  it('uses correction invoice number in P_2', () => {
    const xml = buildFa2Xml(correctionInvoice);
    assert.ok(xml.includes('<P_2>FK/2026/10/001</P_2>'), 'must use correction invoice number');
  });
});

// ─── ADVANCE invoices ─────────────────────────────────────────────────────────

describe('KSeF XML builder — ADVANCE document type', () => {
  const advanceInvoice = makeInvoice({
    document_type: 'ADVANCE',
    invoice_number: 'FZ/2026/10/001',
    advance_amount: 500,
    order_total_gross: 1230,
    remaining_amount: 730,
    net_total: 500,
    vat_total: 115,
    gross_total: 615,
    items: [{
      id: '00000000-0000-0000-0000-000000000010',
      invoice_id: '00000000-0000-0000-0000-000000000001',
      position: 1,
      name: 'Zaliczka na poczet zamówienia',
      unit: 'szt.',
      quantity: 1,
      unit_price_net: 500,
      vat_rate: '23',
      net_amount: 500,
      vat_amount: 115,
      gross_amount: 615,
      discount_pct: null,
      created_at: '2026-10-15T10:00:00Z',
    }],
  });

  it('uses RodzajFaktury ZAL for ADVANCE invoices', () => {
    const xml = buildFa2Xml(advanceInvoice);
    assert.ok(xml.includes('<RodzajFaktury>ZAL</RodzajFaktury>'), 'ADVANCE must use ZAL');
  });

  it('does not include FakturaKorygowana for ADVANCE invoices', () => {
    const xml = buildFa2Xml(advanceInvoice);
    assert.ok(!xml.includes('FakturaKorygowana'), 'ADVANCE must not have FakturaKorygowana');
  });
});

// ─── SETTLEMENT invoices ──────────────────────────────────────────────────────

describe('KSeF XML builder — SETTLEMENT document type', () => {
  const settlementInvoice = makeInvoice({
    document_type: 'SETTLEMENT',
    invoice_number: 'FR/2026/10/001',
    total_advances_amount: 615,
    amount_due: 615,
    net_total: 1000,
    vat_total: 230,
    gross_total: 1230,
    linked_advances: [
      {
        id: '00000000-0000-0000-0000-000000000020',
        advance_invoice_id: '00000000-0000-0000-0000-000000000008',
        advance_amount: 615,
        advance_number: 'FZ/2026/10/001',
      },
    ],
    items: [{
      id: '00000000-0000-0000-0000-000000000010',
      invoice_id: '00000000-0000-0000-0000-000000000001',
      position: 1,
      name: 'Rozliczenie zamówienia - dostawa finalna',
      unit: 'szt.',
      quantity: 1,
      unit_price_net: 1000,
      vat_rate: '23',
      net_amount: 1000,
      vat_amount: 230,
      gross_amount: 1230,
      discount_pct: null,
      created_at: '2026-10-15T10:00:00Z',
    }],
  });

  it('uses RodzajFaktury ROZ for SETTLEMENT invoices', () => {
    const xml = buildFa2Xml(settlementInvoice);
    assert.ok(xml.includes('<RodzajFaktury>ROZ</RodzajFaktury>'), 'SETTLEMENT must use ROZ');
  });

  it('does not include FakturaKorygowana for SETTLEMENT invoices', () => {
    const xml = buildFa2Xml(settlementInvoice);
    assert.ok(!xml.includes('FakturaKorygowana'), 'SETTLEMENT must not have FakturaKorygowana');
  });
});

// ─── SIMPLIFIED invoices ──────────────────────────────────────────────────────

describe('KSeF XML builder — SIMPLIFIED document type', () => {
  const simplifiedInvoice = makeInvoice({
    document_type: 'SIMPLIFIED',
    invoice_number: 'FU/2026/10/001',
    buyer_nip: null,
    buyer_address: '',
    net_total: 100,
    vat_total: 23,
    gross_total: 123,
    items: [{
      id: '00000000-0000-0000-0000-000000000010',
      invoice_id: '00000000-0000-0000-0000-000000000001',
      position: 1,
      name: 'Sprzedaż detaliczna',
      unit: 'szt.',
      quantity: 1,
      unit_price_net: 100,
      vat_rate: '23',
      net_amount: 100,
      vat_amount: 23,
      gross_amount: 123,
      discount_pct: null,
      created_at: '2026-10-15T10:00:00Z',
    }],
  });

  it('uses RodzajFaktury UPR for SIMPLIFIED invoices', () => {
    const xml = buildFa2Xml(simplifiedInvoice);
    assert.ok(xml.includes('<RodzajFaktury>UPR</RodzajFaktury>'), 'SIMPLIFIED must use UPR');
  });

  it('does not include FakturaKorygowana for SIMPLIFIED invoices', () => {
    const xml = buildFa2Xml(simplifiedInvoice);
    assert.ok(!xml.includes('FakturaKorygowana'), 'SIMPLIFIED must not have FakturaKorygowana');
  });

  it('handles null buyer_nip with BrakID', () => {
    const xml = buildFa2Xml(simplifiedInvoice);
    assert.ok(xml.includes('<BrakID>1</BrakID>'), 'simplified invoice with no NIP should use BrakID');
  });
});
