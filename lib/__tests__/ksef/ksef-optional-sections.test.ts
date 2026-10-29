import { describe, it, expect } from 'vitest';
import type { IssuedInvoiceWithItems } from '@/types/issued-invoice';
import { buildFa2Xml } from '@/lib/ksef/xml-builder';
import { validateFa3Xml } from '@/lib/ksef/xml-validator';
import { generateValidationReport } from '@/lib/ksef/validation-report';

function makeBaseInvoice(overrides: Partial<IssuedInvoiceWithItems> = {}): IssuedInvoiceWithItems {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    company_id: '00000000-0000-0000-0000-000000000002',
    invoice_number: 'FV/2026/10/001',
    status: 'issued',
    document_type: 'CORRECTION',
    currency: 'PLN',
    issue_date: '2026-10-28',
    sale_date: null,
    due_date: '2026-11-28',
    payment_method: 'transfer',
    seller_name: 'Test Seller Sp. z o.o.',
    seller_nip: '1234567890',
    seller_address: 'ul. Testowa 1, 00-001 Warszawa',
    seller_bank_account: null,
    company_bank_account: null,
    buyer_name: 'Test Buyer Sp. z o.o.',
    buyer_nip: '0987654321',
    buyer_address: 'ul. Kupiecka 2, 00-002 Kraków',
    buyer_email: null,
    net_total: 1000,
    vat_total: 230,
    gross_total: 1230,
    notes: null,
    corrected_invoice_number: 'FV/2026/09/001',
    corrected_invoice_date: '2026-09-28',
    corrected_invoice_ksef_no: null,
    correction_reason: 'Korekta wartości',
    ksef_reference_no: null,
    ksef_session_token: null,
    ksef_status: null,
    ksef_error_message: null,
    ksef_sent_at: null,
    ksef_accepted_at: null,
    created_by: null,
    created_at: '2026-10-28T10:00:00Z',
    updated_at: '2026-10-28T10:00:00Z',
    items: [{
      id: '00000000-0000-0000-0000-000000000010',
      invoice_id: '00000000-0000-0000-0000-000000000001',
      position: 1,
      name: 'Aktualizacja strony internetowej',
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

describe('Adnotacje optional sections (NoweSrodkiTransportu / PMarzy)', () => {

  // ── Test 1: Standard invoice — sections omitted entirely ──
  it('does not emit NoweSrodkiTransportu, P_23, or PMarzy for a standard invoice', () => {
    const invoice = makeBaseInvoice();
    const xml = buildFa2Xml(invoice);

    expect(xml).not.toContain('<NoweSrodkiTransportu');
    expect(xml).not.toContain('<P_22');
    expect(xml).not.toContain('<PMarzy');
    expect(xml).not.toContain('<P_PMarzy');
    expect(xml).not.toContain('<P_23');

    const validation = validateFa3Xml(xml, invoice);
    expect(validation.valid).toBe(true);

    const report = generateValidationReport(xml, invoice, validation);
    expect(report.readyForKsef).toBe(true);
  });

  // ── Test 2: Margin scheme invoice — PMarzy emitted ──
  it('emits PMarzy when specialProcedure.marginScheme is true', () => {
    const invoice = makeBaseInvoice({
      specialProcedure: { marginScheme: true },
    });
    const xml = buildFa2Xml(invoice);

    expect(xml).toContain('<PMarzy');
    expect(xml).toContain('<P_PMarzy>1</P_PMarzy>');
    expect(xml).not.toContain('<P_PMarzyN');
    // NoweSrodkiTransportu still omitted
    expect(xml).not.toContain('<NoweSrodkiTransportu');

    const validation = validateFa3Xml(xml, invoice);
    const report = generateValidationReport(xml, invoice, validation);

    const optionalSection = report.sections.find(s => s.name === 'Optional Sections Generated');
    const marzyCheck = optionalSection!.checks.find(c => c.name === 'PMarzy');
    expect(marzyCheck!.message).toContain('margin scheme flag active');
  });

  // ── Test 3: New transport vehicle invoice — NoweSrodkiTransportu emitted ──
  it('emits NoweSrodkiTransportu when specialProcedure.newMeansOfTransport is true', () => {
    const invoice = makeBaseInvoice({
      specialProcedure: { newMeansOfTransport: true },
    });
    const xml = buildFa2Xml(invoice);

    expect(xml).toContain('<NoweSrodkiTransportu');
    expect(xml).toContain('<P_22>1</P_22>');
    expect(xml).not.toContain('<P_22N');
    // PMarzy still omitted
    expect(xml).not.toContain('<PMarzy');

    const validation = validateFa3Xml(xml, invoice);
    const report = generateValidationReport(xml, invoice, validation);

    const optionalSection = report.sections.find(s => s.name === 'Optional Sections Generated');
    const transportCheck = optionalSection!.checks.find(c => c.name === 'NoweSrodkiTransportu');
    expect(transportCheck!.message).toContain('new means of transport flag active');
  });

  // ── Test 4: Both flags true — both sections emitted ──
  it('emits both sections when both flags are true', () => {
    const invoice = makeBaseInvoice({
      specialProcedure: { newMeansOfTransport: true, marginScheme: true },
    });
    const xml = buildFa2Xml(invoice);

    expect(xml).toContain('<NoweSrodkiTransportu');
    expect(xml).toContain('<P_22>1</P_22>');
    expect(xml).toContain('<PMarzy');
    expect(xml).toContain('<P_PMarzy>1</P_PMarzy>');
  });

  // ── Test 5: Validation report shows correct status for standard invoice ──
  it('validation report shows not-emitted status for standard invoice', () => {
    const invoice = makeBaseInvoice();
    const xml = buildFa2Xml(invoice);
    const validation = validateFa3Xml(xml, invoice);
    const report = generateValidationReport(xml, invoice, validation);

    const optionalSection = report.sections.find(s => s.name === 'Optional Sections Generated');
    expect(optionalSection).toBeDefined();
    expect(optionalSection!.status).toBe('pass');

    const transportCheck = optionalSection!.checks.find(c => c.name === 'NoweSrodkiTransportu');
    expect(transportCheck!.message).toContain('Not emitted');

    const marzyCheck = optionalSection!.checks.find(c => c.name === 'PMarzy');
    expect(marzyCheck!.message).toContain('Not emitted');

    // Zwolnienie check should always be present
    const zwolnienieCheck = optionalSection!.checks.find(c => c.name === 'Zwolnienie (P_19)');
    expect(zwolnienieCheck).toBeDefined();
    expect(zwolnienieCheck!.message).toContain('P_19N');
  });
});
