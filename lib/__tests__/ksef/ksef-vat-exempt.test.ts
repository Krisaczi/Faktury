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

// ─── VAT exempt (zw) invoices ─────────────────────────────────────────────────

describe('KSeF XML builder — VAT exempt (zw) invoices', () => {
  const exemptInvoice = makeInvoice({
    net_total: 50,
    vat_total: 0,
    gross_total: 50,
    notes: 'Zwolnienie podmiotowe z VAT na podstawie art. 113 ust. 1 ustawy o VAT',
    items: [{
      id: '00000000-0000-0000-0000-000000000010',
      invoice_id: '00000000-0000-0000-0000-000000000001',
      position: 1,
      name: 'Aktualizacja strony internetowej',
      unit: 'szt.',
      quantity: 1,
      unit_price_net: 50,
      vat_rate: 'zw',
      net_amount: 50,
      vat_amount: 0,
      gross_amount: 50,
      discount_pct: null,
    }],
  });

  it('maps zw to P_13_7 (VAT exempt), NOT P_13_6_1 (0% rate)', () => {
    const xml = buildFa2Xml(exemptInvoice);
    assert.ok(xml.includes('<P_13_7>50.00</P_13_7>'), 'zw must map to P_13_7');
    assert.ok(!xml.includes('<P_13_6_1>'), 'zw must NOT produce P_13_6_1 (that is 0% rate)');
  });

  it('never generates P_13_6_1 for VAT exempt invoices', () => {
    const xml = buildFa2Xml(exemptInvoice);
    assert.ok(!xml.includes('P_13_6_1'), 'P_13_6_1 must not appear for zw invoices');
  });

  it('does NOT emit P_13_9 (conditional field) for VAT exempt invoices', () => {
    const xml = buildFa2Xml(exemptInvoice);
    assert.ok(!xml.includes('<P_13_9'), 'P_13_9 should not be emitted (conditional field for Art. 100 services)');
  });

  it('sets P_18 to 2 (not applicable) for VAT exempt invoices, NOT 1 (reverse charge)', () => {
    const xml = buildFa2Xml(exemptInvoice);
    assert.ok(xml.includes('<P_18>2</P_18>'), 'P_18 must be 2 for exempt invoices');
    assert.ok(!xml.includes('<P_18>1</P_18>'), 'P_18 must NOT be 1 (reverse charge) for exempt invoices');
  });

  it('uses notes as the VAT exemption reason in P_19A', () => {
    const xml = buildFa2Xml(exemptInvoice);
    assert.ok(
      xml.includes('Zwolnienie podmiotowe z VAT na podstawie art. 113 ust. 1 ustawy o VAT'),
      'P_19A should contain the notes text',
    );
  });

  it('uses default exemption text when notes are empty', () => {
    const xml = buildFa2Xml(makeInvoice({
      net_total: 50,
      vat_total: 0,
      gross_total: 50,
      notes: null,
      items: [{
        id: '00000000-0000-0000-0000-000000000010',
        invoice_id: '00000000-0000-0000-0000-000000000001',
        position: 1,
        name: 'Usługa',
        unit: 'szt.',
        quantity: 1,
        unit_price_net: 50,
        vat_rate: 'zw',
        net_amount: 50,
        vat_amount: 0,
        gross_amount: 50,
        discount_pct: null,
      }],
    }));
    assert.ok(xml.includes('zwolnienie z podatku VAT'), 'should use default exemption text');
  });

  it('includes the Zwolnienie block with P_19=1 for exempt invoices', () => {
    const xml = buildFa2Xml(exemptInvoice);
    assert.ok(xml.includes('<P_19>1</P_19>'), 'P_19 should be 1 for exempt invoices');
  });

  it('includes P_12=zw in the line item', () => {
    const xml = buildFa2Xml(exemptInvoice);
    assert.ok(xml.includes('<P_12>zw</P_12>'), 'line item should have P_12=zw');
  });

  it('maps transfer to FormaPlatnosci code 6 (przelew), not 3 (bon)', () => {
    const xml = buildFa2Xml(exemptInvoice);
    assert.ok(xml.includes('<FormaPlatnosci>6</FormaPlatnosci>'), 'transfer should map to 6');
    assert.ok(!xml.includes('<FormaPlatnosci>3</FormaPlatnosci>'), 'must not be 3 (bon)');
  });
});

// ─── 23% VAT invoices (regression) ────────────────────────────────────────────

describe('KSeF XML builder — 23% VAT invoices (regression)', () => {
  it('maps 23% to P_13_1 and P_14_1', () => {
    const xml = buildFa2Xml(makeInvoice());
    assert.ok(xml.includes('<P_13_1>1000.00</P_13_1>'), '23% net should be in P_13_1');
    assert.ok(xml.includes('<P_14_1>230.00</P_14_1>'), '23% VAT should be in P_14_1');
    assert.ok(!xml.includes('<P_13_7>'), 'P_13_7 should not appear for 23% invoice');
  });

  it('sets P_18 to 2 for non-reverse-charge 23% invoices', () => {
    const xml = buildFa2Xml(makeInvoice());
    assert.ok(xml.includes('<P_18>2</P_18>'), 'P_18 should be 2');
  });
});

// ─── 8% VAT invoices (regression) ─────────────────────────────────────────────

describe('KSeF XML builder — 8% VAT invoices (regression)', () => {
  it('maps 8% to P_13_2 and P_14_2', () => {
    const xml = buildFa2Xml(makeInvoice({
      net_total: 1000,
      vat_total: 80,
      gross_total: 1080,
      items: [{
        id: '00000000-0000-0000-0000-000000000010',
        invoice_id: '00000000-0000-0000-0000-000000000001',
        position: 1,
        name: 'Usługa',
        unit: 'szt.',
        quantity: 1,
        unit_price_net: 1000,
        vat_rate: '8',
        net_amount: 1000,
        vat_amount: 80,
        gross_amount: 1080,
        discount_pct: null,
      }],
    }));
    assert.ok(xml.includes('<P_13_2>1000.00</P_13_2>'), '8% net should be in P_13_2');
    assert.ok(xml.includes('<P_14_2>80.00</P_14_2>'), '8% VAT should be in P_14_2');
  });
});

// ─── 5% VAT invoices (regression) ─────────────────────────────────────────────

describe('KSeF XML builder — 5% VAT invoices (regression)', () => {
  it('maps 5% to P_13_3 and P_14_3', () => {
    const xml = buildFa2Xml(makeInvoice({
      net_total: 1000,
      vat_total: 50,
      gross_total: 1050,
      items: [{
        id: '00000000-0000-0000-0000-000000000010',
        invoice_id: '00000000-0000-0000-0000-000000000001',
        position: 1,
        name: 'Usługa',
        unit: 'szt.',
        quantity: 1,
        unit_price_net: 1000,
        vat_rate: '5',
        net_amount: 1000,
        vat_amount: 50,
        gross_amount: 1050,
        discount_pct: null,
      }],
    }));
    assert.ok(xml.includes('<P_13_3>1000.00</P_13_3>'), '5% net should be in P_13_3');
    assert.ok(xml.includes('<P_14_3>50.00</P_14_3>'), '5% VAT should be in P_14_3');
  });
});

// ─── 0% VAT invoices (regression) ─────────────────────────────────────────────

describe('KSeF XML builder — 0% VAT invoices (regression)', () => {
  it('maps 0% to P_13_5', () => {
    const xml = buildFa2Xml(makeInvoice({
      net_total: 1000,
      vat_total: 0,
      gross_total: 1000,
      items: [{
        id: '00000000-0000-0000-0000-000000000010',
        invoice_id: '00000000-0000-0000-0000-000000000001',
        position: 1,
        name: 'Usługa',
        unit: 'szt.',
        quantity: 1,
        unit_price_net: 1000,
        vat_rate: '0',
        net_amount: 1000,
        vat_amount: 0,
        gross_amount: 1000,
        discount_pct: null,
      }],
    }));
    assert.ok(xml.includes('<P_13_5>1000.00</P_13_5>'), '0% net should be in P_13_5');
    assert.ok(!xml.includes('<P_13_7>'), 'P_13_7 should not appear for 0% invoice');
  });
});

// ─── Non-taxable (np) invoices ────────────────────────────────────────────────

describe('KSeF XML builder — non-taxable (np) invoices', () => {
  it('maps np to P_13_8 (non-taxable), NOT P_13_7 (exempt)', () => {
    const xml = buildFa2Xml(makeInvoice({
      net_total: 200,
      vat_total: 0,
      gross_total: 200,
      items: [{
        id: '00000000-0000-0000-0000-000000000010',
        invoice_id: '00000000-0000-0000-0000-000000000001',
        position: 1,
        name: 'Usługa',
        unit: 'szt.',
        quantity: 1,
        unit_price_net: 200,
        vat_rate: 'np',
        net_amount: 200,
        vat_amount: 0,
        gross_amount: 200,
        discount_pct: null,
      }],
    }));
    assert.ok(xml.includes('<P_13_8>200.00</P_13_8>'), 'np must map to P_13_8');
    assert.ok(!xml.includes('<P_13_7>'), 'np must NOT map to P_13_7 (that is exempt)');
  });
});

// ─── Out of scope (oo) invoices ───────────────────────────────────────────────

describe('KSeF XML builder — out of scope (oo) invoices', () => {
  it('maps oo to P_13_10 (domestic reverse charge), NOT P_13_8 (non-taxable)', () => {
    const xml = buildFa2Xml(makeInvoice({
      net_total: 300,
      vat_total: 0,
      gross_total: 300,
      items: [{
        id: '00000000-0000-0000-0000-000000000010',
        invoice_id: '00000000-0000-0000-0000-000000000001',
        position: 1,
        name: 'Usługa',
        unit: 'szt.',
        quantity: 1,
        unit_price_net: 300,
        vat_rate: 'oo',
        net_amount: 300,
        vat_amount: 0,
        gross_amount: 300,
        discount_pct: null,
      }],
    }));
    assert.ok(xml.includes('<P_13_10>300.00</P_13_10>'), 'oo must map to P_13_10 (reverse charge)');
    assert.ok(!xml.includes('<P_13_8>'), 'oo must NOT map to P_13_8 (that is for np)');
  });

  it('sets P_18 to 1 (reverse charge) for oo invoices', () => {
    const xml = buildFa2Xml(makeInvoice({
      net_total: 300,
      vat_total: 0,
      gross_total: 300,
      items: [{
        id: '00000000-0000-0000-0000-000000000010',
        invoice_id: '00000000-0000-0000-0000-000000000001',
        position: 1,
        name: 'Usługa',
        unit: 'szt.',
        quantity: 1,
        unit_price_net: 300,
        vat_rate: 'oo',
        net_amount: 300,
        vat_amount: 0,
        gross_amount: 300,
        discount_pct: null,
      }],
    }));
    assert.ok(xml.includes('<P_18>1</P_18>'), 'P_18 must be 1 for reverse charge (oo)');
  });
});

// ─── Mixed np + oo invoices ───────────────────────────────────────────────────

describe('KSeF XML builder — mixed np + oo invoices', () => {
  it('splits np into P_13_8 and oo into P_13_10', () => {
    const xml = buildFa2Xml(makeInvoice({
      net_total: 500,
      vat_total: 0,
      gross_total: 500,
      items: [
        {
          id: '00000000-0000-0000-0000-000000000010',
          invoice_id: '00000000-0000-0000-0000-000000000001',
          position: 1,
          name: 'Usługa NP',
          unit: 'szt.',
          quantity: 1,
          unit_price_net: 200,
          vat_rate: 'np',
          net_amount: 200,
          vat_amount: 0,
          gross_amount: 200,
          discount_pct: null,
        },
        {
          id: '00000000-0000-0000-0000-000000000011',
          invoice_id: '00000000-0000-0000-0000-000000000001',
          position: 2,
          name: 'Usługa OO',
          unit: 'szt.',
          quantity: 1,
          unit_price_net: 300,
          vat_rate: 'oo',
          net_amount: 300,
          vat_amount: 0,
          gross_amount: 300,
          discount_pct: null,
        },
      ],
    }));
    assert.ok(xml.includes('<P_13_8>200.00</P_13_8>'), 'np should go to P_13_8=200');
    assert.ok(xml.includes('<P_13_10>300.00</P_13_10>'), 'oo should go to P_13_10=300');
    assert.ok(!xml.includes('<P_13_8>500.00</P_13_8>'), 'np+oo must NOT be combined into P_13_8');
  });

  it('sets P_18 to 1 when oo is present alongside np', () => {
    const xml = buildFa2Xml(makeInvoice({
      net_total: 500,
      vat_total: 0,
      gross_total: 500,
      items: [
        {
          id: '00000000-0000-0000-0000-000000000010',
          invoice_id: '00000000-0000-0000-0000-000000000001',
          position: 1,
          name: 'Usługa NP',
          unit: 'szt.',
          quantity: 1,
          unit_price_net: 200,
          vat_rate: 'np',
          net_amount: 200,
          vat_amount: 0,
          gross_amount: 200,
          discount_pct: null,
        },
        {
          id: '00000000-0000-0000-0000-000000000011',
          invoice_id: '00000000-0000-0000-0000-000000000001',
          position: 2,
          name: 'Usługa OO',
          unit: 'szt.',
          quantity: 1,
          unit_price_net: 300,
          vat_rate: 'oo',
          net_amount: 300,
          vat_amount: 0,
          gross_amount: 300,
          discount_pct: null,
        },
      ],
    }));
    assert.ok(xml.includes('<P_18>1</P_18>'), 'P_18 must be 1 when oo (reverse charge) is present');
  });
});
