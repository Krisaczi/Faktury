import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseXmlInvoices } from '../../parsers/xml-invoice-parser.ts';

const KSEF_WITH_PAYMENT = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="urn:mf.gov.pl:KSeF:wizualizacja:FA:1">
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <Nazwa>Test Seller Sp. z o.o.</Nazwa>
      <NIP>1234567890</NIP>
    </DaneIdentyfikacyjne>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <Nazwa>Test Buyer</Nazwa>
      <NIP>0987654321</NIP>
    </DaneIdentyfikacyjne>
  </Podmiot2>
  <Fa>
    <P_1>2026-09-01</P_1>
    <P_2>FV/2026/09/001</P_2>
    <P_6>2026-09-16</P_6>
    <P_15>405.90</P_15>
    <KodWaluty>PLN</KodWaluty>
  </Fa>
  <Platnosc>
    <RachunekBankowy>
      <NrRB>69114012382444800352226545</NrRB>
      <NazwaBanku>mBank S.A.</NazwaBanku>
    </RachunekBankowy>
  </Platnosc>
</Faktura>`;

const KSEF_NO_PAYMENT = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="urn:mf.gov.pl:KSeF:wizualizacja:FA:1">
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <Nazwa>Test Seller Sp. z o.o.</Nazwa>
      <NIP>1234567890</NIP>
    </DaneIdentyfikacyjne>
  </Podmiot1>
  <Fa>
    <P_1>2026-09-01</P_1>
    <P_2>FV/2026/09/002</P_2>
    <P_15>100.00</P_15>
    <KodWaluty>PLN</KodWaluty>
  </Fa>
</Faktura>`;

const KSEF_PAYMENT_NO_BANK_NAME = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="urn:mf.gov.pl:KSeF:wizualizacja:FA:1">
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <Nazwa>Test Seller</Nazwa>
      <NIP>1234567890</NIP>
    </DaneIdentyfikacyjne>
  </Podmiot1>
  <Fa>
    <P_1>2026-09-01</P_1>
    <P_2>FV/2026/09/003</P_2>
    <P_15>200.00</P_15>
    <KodWaluty>PLN</KodWaluty>
  </Fa>
  <Platnosc>
    <RachunekBankowy>
      <NrRB>69114012382444800352226545</NrRB>
    </RachunekBankowy>
  </Platnosc>
</Faktura>`;

describe('KSeF payment parsing', () => {
  it('Test 1: extracts bankAccountNumber and bankName from Platnosc/RachunekBankowy', async () => {
    const result = await parseXmlInvoices(KSEF_WITH_PAYMENT);
    assert.equal(result.invoices.length, 1);
    const inv = result.invoices[0];
    assert.equal(inv.bankAccount, '69114012382444800352226545');
    assert.equal(inv.bankName, 'mBank S.A.');
  });

  it('Test 2: missing payment section → bankAccount and bankName are undefined', async () => {
    const result = await parseXmlInvoices(KSEF_NO_PAYMENT);
    assert.equal(result.invoices.length, 1);
    const inv = result.invoices[0];
    assert.equal(inv.bankName, undefined);
    // bankAccount may still be found from top-level NrRachunku, but there is none here
    assert.equal(inv.bankAccount, undefined);
  });

  it('Test 3: payment with NrRB but no NazwaBanku → bankAccount set, bankName undefined', async () => {
    const result = await parseXmlInvoices(KSEF_PAYMENT_NO_BANK_NAME);
    assert.equal(result.invoices.length, 1);
    const inv = result.invoices[0];
    assert.equal(inv.bankAccount, '69114012382444800352226545');
    assert.equal(inv.bankName, undefined);
  });

  it('does not block on malformed Platnosc', async () => {
    const malformed = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="urn:mf.gov.pl:KSeF:wizualizacja:FA:1">
  <Podmiot1><DaneIdentyfikacyjne><Nazwa>Seller</Nazwa><NIP>1234567890</NIP></DaneIdentyfikacyjne></Podmiot1>
  <Fa><P_1>2026-09-01</P_1><P_2>FV/2026/09/004</P_2><P_15>50.00</P_15><KodWaluty>PLN</KodWaluty></Fa>
  <Platnosc><RachunekBankowy></RachunekBankowy></Platnosc>
</Faktura>`;
    const result = await parseXmlInvoices(malformed);
    assert.equal(result.invoices.length, 1);
    assert.equal(result.errors.length, 0);
  });
});
