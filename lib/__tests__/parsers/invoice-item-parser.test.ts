/**
 * Tests for the invoice item parser orchestrator.
 *
 * Validates the fallback chain:
 *   1. KSeF XML → items with confidence 1.0
 *   2. Unsupported content type → empty result with errors
 *
 * Run (after `npm install`):
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/parsers/invoice-item-parser.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseInvoiceItems } from '@/lib/parsers/invoice-item-parser';

describe('parseInvoiceItems orchestrator', () => {
  it('returns empty result with errors when content type is unsupported', async () => {
    const result = await parseInvoiceItems('test', Buffer.from('hello'), 'text/plain');
    assert.deepEqual(result.items, []);
    assert.equal(result.source, 'manual');
    assert.ok(result.errors.length > 0);
  });

  it('parses KSeF XML and returns items with confidence 1.0', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek><P_1>2024-01-15</P_1><P_2>FV/001</P_2></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>1234567890</NIP><Nazwa>Test</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_15>1845.00</P_15>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Usługa IT</P_7>
      <P_8A>szt.</P_8A>
      <P_8B>10.0000</P_8B>
      <P_9A>150.00</P_9A>
      <P_11>1500.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
  </Fa>
</Faktura>`;

    const result = await parseInvoiceItems('test-id', xml, 'application/xml');
    assert.equal(result.source, 'ksef_xml');
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].description, 'Usługa IT');
    assert.equal(result.items[0].confidence, 1.0);
    assert.equal(result.averageConfidence, 1.0);
  });
});
