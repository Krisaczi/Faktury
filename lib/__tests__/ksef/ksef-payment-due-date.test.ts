import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFa2Xml } from '../../ksef/xml-builder';
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
    payment_method: 'cash',
    seller_name: 'Test Seller Sp. z o.o.',
    seller_nip: '1234567890',
    seller_address: 'ul. Testowa 1, 00-001 Warszawa',
    seller_bank_account: null,
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

describe('KSeF XML builder — payment method mapping', () => {
  it('maps cash to FormaPlatnosci code 1 (gotówka), never 3 (bon)', () => {
    const xml = buildFa2Xml(makeInvoice({ payment_method: 'cash' }));
    assert.ok(xml.includes('<FormaPlatnosci>1</FormaPlatnosci>'), 'cash should map to code 1');
    assert.ok(!xml.includes('<FormaPlatnosci>3</FormaPlatnosci>'), 'cash must never map to 3 (bon)');
  });

  it('maps transfer to FormaPlatnosci code 6 (przelew)', () => {
    const xml = buildFa2Xml(makeInvoice({ payment_method: 'transfer' }));
    assert.ok(xml.includes('<FormaPlatnosci>6</FormaPlatnosci>'), 'transfer should map to code 6');
  });

  it('maps card to FormaPlatnosci code 2 (karta)', () => {
    const xml = buildFa2Xml(makeInvoice({ payment_method: 'card' }));
    assert.ok(xml.includes('<FormaPlatnosci>2</FormaPlatnosci>'), 'card should map to code 2');
  });

  it('maps blik to FormaPlatnosci code 7 (mobile)', () => {
    const xml = buildFa2Xml(makeInvoice({ payment_method: 'blik' as unknown as 'cash' }));
    assert.ok(xml.includes('<FormaPlatnosci>7</FormaPlatnosci>'), 'blik should map to code 7');
  });

  it('falls back to 6 (przelew) for unknown method, never bon', () => {
    const xml = buildFa2Xml(makeInvoice({ payment_method: 'other' as unknown as 'cash' }));
    assert.ok(xml.includes('<FormaPlatnosci>6</FormaPlatnosci>'), 'unknown should fall back to 6');
    assert.ok(!xml.includes('<FormaPlatnosci>3</FormaPlatnosci>'), 'must never fall back to 3 (bon)');
  });
});

describe('KSeF XML builder — due date in XML', () => {
  it('includes TerminPlatnosci when due_date is set', () => {
    const xml = buildFa2Xml(makeInvoice({ due_date: '2026-09-20' }));
    assert.ok(xml.includes('<TerminPlatnosci>2026-09-20</TerminPlatnosci>'), 'due date should be in XML');
  });

  it('includes TerminPlatnosci with correct date for transfer payment', () => {
    const xml = buildFa2Xml(makeInvoice({
      payment_method: 'transfer',
      due_date: '2026-10-01',
    }));
    assert.ok(xml.includes('<TerminPlatnosci>2026-10-01</TerminPlatnosci>'), 'due date should be 2026-10-01');
    assert.ok(xml.includes('<FormaPlatnosci>6</FormaPlatnosci>'), 'transfer should map to 6');
  });

  it('omits TerminPlatnosci when due_date is null', () => {
    const xml = buildFa2Xml(makeInvoice({ due_date: null }));
    assert.ok(!xml.includes('<TerminPlatnosci>'), 'no TerminPlatnosci when due_date is null');
  });
});

describe('KSeF XML builder — Rozliczenie', () => {
  it('includes DoZaplaty with the gross total', () => {
    const xml = buildFa2Xml(makeInvoice());
    assert.ok(xml.includes('<DoZaplaty>1230.00</DoZaplaty>'), 'DoZaplaty should contain gross total');
  });
});
