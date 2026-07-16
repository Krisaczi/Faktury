/**
 * Tests for the rule-based line item extractor (OCR text path).
 *
 * Validates that the extractor:
 *   - Detects line items with description + numeric columns
 *   - Skips header lines (Lp. Nazwa...) and summary lines (Razem, Do zapłaty)
 *   - Skips metadata lines (NIP, IBAN, Sprzedawca)
 *   - Assigns OCR source and reduced confidence
 *
 * Run (after `npm install`):
 *   node --require ./node_modules/jiti/register.js \
 *        --test lib/__tests__/parsers/line-item-extractor.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractLineItemsFromOcrText } from '@/lib/parsers/line-item-extractor';

describe('extractLineItemsFromOcrText', () => {
  it('extracts line items from OCR text with description and amounts', () => {
    const text = [
      'Faktura VAT nr FV/2024/001',
      'Sprzedawca: ABC Sp. z o.o.',
      'NIP: 1234567890',
      '',
      'Lp. Nazwa Ilość Cena netto Wartość netto VAT Kwota VAT Wartość brutto',
      '1. Usługa programistyczna 10 150,00 1500,00 23 345,00 1845,00',
      '2. Konsultacja 2 200,00 400,00 23 92,00 492,00',
      '',
      'Razem: 1900,00 437,00 2337,00',
    ].join('\n');

    const items = extractLineItemsFromOcrText(text, 1);

    assert.ok(items.length >= 2, `Expected >= 2 items, got ${items.length}`);
    assert.ok(items[0].description!.includes('Usługa programistyczna'));
    assert.equal(items[0].quantity, 10);
    assert.equal(items[0].netAmount, 1500);
    assert.equal(items[0].vatRate, '23');
    assert.equal(items[0].grossAmount, 1845);
    assert.equal(items[0].source, 'ocr');
    assert.ok(items[0].confidence > 0 && items[0].confidence <= 1);
  });

  it('skips header and summary lines', () => {
    const text = [
      'Lp. Nazwa Ilość Cena Wartość VAT Kwota Brutto',
      'Razem 1000,00 230,00 1230,00',
      'Do zapłaty: 1230,00',
    ].join('\n');

    const items = extractLineItemsFromOcrText(text, 1);
    assert.equal(items.length, 0);
  });

  it('skips NIP/IBAN/seller metadata lines', () => {
    const text = [
      'NIP: 1234567890',
      'IBAN: PL00 1234 5678 9012 3456 7890 1234',
      'Sprzedawca: ABC Sp. z o.o.',
    ].join('\n');

    const items = extractLineItemsFromOcrText(text, 1);
    assert.equal(items.length, 0);
  });

  it('handles empty text', () => {
    const items = extractLineItemsFromOcrText('', 1);
    assert.equal(items.length, 0);
  });
});
