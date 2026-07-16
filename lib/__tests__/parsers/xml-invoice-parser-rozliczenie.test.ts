/**
 * Tests for KSeF XML parser Rozliczenie (charges) extraction.
 *
 * Verifies that <Obciazenia> entries are parsed into charges[], and that
 * <SumaObciazen> and <DoZaplaty> are extracted as chargesTotal and amountDue.
 *
 * Run (after `npm install`):
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/parsers/xml-invoice-parser-rozliczenie.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseXmlInvoices } from '@/lib/parsers/xml-invoice-parser';

describe('KSeF XML Rozliczenie extraction', () => {
  const ksefXml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA</KodFormularza>
    <P_1>2024-01-15</P_1>
    <P_2>FV/2024/001</P_2>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>1234567890</NIP>
      <Nazwa>ABC Sp. z o.o.</Nazwa>
    </DaneIdentyfikacyjne>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NIP>9876543210</NIP>
      <Nazwa>XYZ Sp. z o.o.</Nazwa>
    </DaneIdentyfikacyjne>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2024-01-15</P_1>
    <P_2>FV/2024/001</P_2>
    <P_15>1845.00</P_15>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Usługa programistyczna</P_7>
      <P_8A>szt.</P_8A>
      <P_8B>10.0000</P_8B>
      <P_9A>150.00</P_9A>
      <P_11>1500.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
    <Rozliczenie>
      <Obciazenia>
        <Kwota>42.00</Kwota>
        <Powod>23648 KAUCJA PET 12X0,5ZŁ</Powod>
      </Obciazenia>
      <SumaObciazen>42</SumaObciazen>
      <DoZaplaty>189.49</DoZaplaty>
    </Rozliczenie>
  </Fa>
</Faktura>`;

  it('extracts Obciazenia entries as charges[]', async () => {
    const result = await parseXmlInvoices(ksefXml);
    assert.equal(result.invoices.length, 1);
    const charges = result.invoices[0].charges!;
    assert.equal(charges.length, 1);
    assert.equal(charges[0].amount, 42);
    assert.equal(charges[0].reason, '23648 KAUCJA PET 12X0,5ZŁ');
  });

  it('extracts SumaObciazen as chargesTotal', async () => {
    const result = await parseXmlInvoices(ksefXml);
    assert.equal(result.invoices[0].chargesTotal, 42);
  });

  it('extracts DoZaplaty as amountDue', async () => {
    const result = await parseXmlInvoices(ksefXml);
    assert.equal(result.invoices[0].amountDue, 189.49);
  });
});

describe('KSeF XML with multiple Obciazenia', () => {
  const ksefXml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek><P_1>2024-01-15</P_1><P_2>FV/2024/002</P_2></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>1234567890</NIP><Nazwa>Sprzedawca</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>9876543210</NIP><Nazwa>Kupujacy</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_15>1000.00</P_15>
    <Rozliczenie>
      <Obciazenia><Kwota>42.00</Kwota><Powod>KAUCJA PET</Powod></Obciazenia>
      <Obciazenia><Kwota>15.50</Kwota><Powod>OPAKOWANIA</Powod></Obciazenia>
      <SumaObciazen>57.50</SumaObciazen>
      <DoZaplaty>1057.50</DoZaplaty>
    </Rozliczenie>
  </Fa>
</Faktura>`;

  it('parses multiple Obciazenia entries', async () => {
    const result = await parseXmlInvoices(ksefXml);
    const charges = result.invoices[0].charges!;
    assert.equal(charges.length, 2);
    assert.equal(charges[0].amount, 42);
    assert.equal(charges[0].reason, 'KAUCJA PET');
    assert.equal(charges[1].amount, 15.50);
    assert.equal(charges[1].reason, 'OPAKOWANIA');
  });

  it('sums chargesTotal correctly', async () => {
    const result = await parseXmlInvoices(ksefXml);
    assert.equal(result.invoices[0].chargesTotal, 57.50);
    assert.equal(result.invoices[0].amountDue, 1057.50);
  });
});

describe('KSeF XML without Rozliczenie', () => {
  const ksefXml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek><P_1>2024-01-15</P_1><P_2>FV/2024/003</P_2></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>1234567890</NIP><Nazwa>Sprzedawca</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>9876543210</NIP><Nazwa>Kupujacy</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa><KodWaluty>PLN</KodWaluty><P_15>100.00</P_15></Fa>
</Faktura>`;

  it('returns empty charges array when no Rozliczenie', async () => {
    const result = await parseXmlInvoices(ksefXml);
    assert.deepEqual(result.invoices[0].charges, []);
    assert.equal(result.invoices[0].chargesTotal, undefined);
    assert.equal(result.invoices[0].amountDue, undefined);
  });
});

describe('KSeF XML with namespaced Rozliczenie (ns0: prefix)', () => {
  const ksefXml = `<?xml version="1.0" encoding="UTF-8"?>
<ns0:Faktura xmlns:ns0="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <ns0:Naglowek><ns0:P_1>2024-01-15</ns0:P_1><ns0:P_2>FV/2024/004</ns0:P_2></ns0:Naglowek>
  <ns0:Podmiot1><ns0:DaneIdentyfikacyjne><ns0:NIP>1234567890</ns0:NIP><ns0:Nazwa>Sprzedawca</ns0:Nazwa></ns0:DaneIdentyfikacyjne></ns0:Podmiot1>
  <ns0:Podmiot2><ns0:DaneIdentyfikacyjne><ns0:NIP>9876543210</ns0:NIP><ns0:Nazwa>Kupujacy</ns0:Nazwa></ns0:DaneIdentyfikacyjne></ns0:Podmiot2>
  <ns0:Fa>
    <ns0:KodWaluty>PLN</ns0:KodWaluty>
    <ns0:P_15>189.49</ns0:P_15>
    <ns0:Rozliczenie>
      <ns0:Obciazenia>
        <ns0:Kwota>42.00</ns0:Kwota>
        <ns0:Powod>23648 KAUCJA PET 12X0,5ZŁ</ns0:Powod>
      </ns0:Obciazenia>
      <ns0:SumaObciazen>42</ns0:SumaObciazen>
      <ns0:DoZaplaty>189.49</ns0:DoZaplaty>
    </ns0:Rozliczenie>
  </ns0:Fa>
</ns0:Faktura>`;

  it('parses namespaced Rozliczenie elements', async () => {
    const result = await parseXmlInvoices(ksefXml);
    const charges = result.invoices[0].charges!;
    assert.equal(charges.length, 1);
    assert.equal(charges[0].amount, 42);
    assert.equal(charges[0].reason, '23648 KAUCJA PET 12X0,5ZŁ');
    assert.equal(result.invoices[0].chargesTotal, 42);
    assert.equal(result.invoices[0].amountDue, 189.49);
  });
});
