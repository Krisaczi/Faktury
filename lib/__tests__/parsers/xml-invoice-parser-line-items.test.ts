/**
 * Tests for KSeF XML parser line item extraction.
 *
 * Tests that FaWiersz elements are parsed correctly (fields directly inside
 * FaWiersz, no nested Wiersz wrapper), UBL InvoiceLine elements work, and
 * empty invoices return an empty array.
 *
 * Run (after `npm install`):
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/parsers/xml-invoice-parser-line-items.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseXmlInvoices } from '@/lib/parsers/xml-invoice-parser';

describe('KSeF XML line items', () => {
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
    <FaWiersz>
      <NrWierszaFa>2</NrWierszaFa>
      <P_7>Konsultacja techniczna</P_7>
      <P_8A>godz.</P_8A>
      <P_8B>2.0000</P_8B>
      <P_9A>200.00</P_9A>
      <P_11>400.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
  </Fa>
</Faktura>`;

  it('extracts 2 line items from KSeF FaWiersz elements', async () => {
    const result = await parseXmlInvoices(ksefXml);
    assert.equal(result.invoices.length, 1);
    const items = result.invoices[0].lineItems!;
    assert.equal(items.length, 2);
  });

  it('parses P_7 as name, P_8B as quantity, P_8A as unit', async () => {
    const result = await parseXmlInvoices(ksefXml);
    const item = result.invoices[0].lineItems![0];
    assert.equal(item.name, 'Usługa programistyczna');
    assert.equal(item.quantity, 10);
    assert.equal(item.unit, 'szt.');
  });

  it('parses P_9A as unitPrice, P_11 as netAmount, P_12 as vatRate', async () => {
    const result = await parseXmlInvoices(ksefXml);
    const item = result.invoices[0].lineItems![0];
    assert.equal(item.unitPrice, 150);
    assert.equal(item.netAmount, 1500);
    assert.equal(item.vatRate, '23');
  });

  it('extracts seller and buyer NIP/name', async () => {
    const result = await parseXmlInvoices(ksefXml);
    assert.equal(result.invoices[0].seller?.nip, '1234567890');
    assert.equal(result.invoices[0].buyer?.nip, '9876543210');
  });
});

describe('UBL XML line items', () => {
  const ublXml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:ID>INV-001</cbc:ID>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>ABC Corp</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">10</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="PLN">1500.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Software License</cbc:Name>
      <cbc:Description>Annual license for IDE</cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="PLN">150.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  it('extracts name, description, quantity from UBL', async () => {
    const result = await parseXmlInvoices(ublXml);
    const item = result.invoices[0].lineItems![0];
    assert.equal(item.name, 'Software License');
    assert.equal(item.description, 'Annual license for IDE');
    assert.equal(item.quantity, 10);
  });

  it('extracts unit from unitCode attribute', async () => {
    const result = await parseXmlInvoices(ublXml);
    assert.equal(result.invoices[0].lineItems![0].unit, 'C62');
  });
});

describe('Empty invoice (no line items)', () => {
  it('returns empty array', async () => {
    const xml = `<?xml version="1.0"?>
    <Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
      <Naglowek><P_1>2024-01-15</P_1><P_2>FV/001</P_2></Naglowek>
      <Podmiot1><DaneIdentyfikacyjne><NIP>1234567890</NIP><Nazwa>Test</Nazwa></DaneIdentyfikacyjne></Podmiot1>
      <Fa><KodWaluty>PLN</KodWaluty><P_15>100.00</P_15></Fa>
    </Faktura>`;
    const result = await parseXmlInvoices(xml);
    assert.deepEqual(result.invoices[0].lineItems, []);
  });
});
