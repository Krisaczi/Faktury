import type { BBox, ParsedItemResult } from '@/types/invoice-item';
import type { PdfTextResult, PdfTextPage, PdfTextItem } from './pdf-text-parser';

const VAT_RATE_PATTERN = /(?:^|\s)(23|8|5|0|zw|np|oo)(?:\s|%|$)/i;
const NUMBER_PATTERN = /-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?/g;

function parseNumber(s: string): number {
  return parseFloat(s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
}

function parseAmount(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseNumber(s);
  return isNaN(n) ? undefined : n;
}

function detectVatRate(text: string): string | undefined {
  const m = text.match(VAT_RATE_PATTERN);
  if (!m) return undefined;
  const r = m[1].toLowerCase();
  return r === 'zw' || r === 'np' || r === 'oo' ? r.toUpperCase() : r;
}

function hasAmountColumn(text: string): boolean {
  const numbers = text.match(NUMBER_PATTERN);
  return numbers !== null && numbers.length >= 3;
}

function findBBoxForText(page: PdfTextPage, searchText: string): BBox | undefined {
  const search = searchText.trim().toLowerCase();
  if (!search) return undefined;

  let bestMatch: { item: PdfTextItem; score: number } | null = null;

  for (const item of page.items) {
    const itemLower = item.str.toLowerCase();
    if (itemLower.includes(search.slice(0, 15))) {
      const score = Math.min(itemLower.length, search.length) / Math.max(itemLower.length, search.length);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { item, score };
      }
    }
  }

  if (bestMatch && bestMatch.score > 0.3) {
    const it = bestMatch.item;
    return {
      x: it.bbox.x,
      y: Math.max(0, it.bbox.y - 0.01),
      width: it.bbox.width,
      height: it.bbox.height + 0.01,
    };
  }

  return undefined;
}

interface RawLine {
  text: string;
  pageNumber: number;
  bbox?: BBox;
}

function splitIntoLines(pdfResult: PdfTextResult): RawLine[] {
  const lines: RawLine[] = [];

  for (const page of pdfResult.pages) {
    const sortedItems = [...page.items].sort((a, b) => {
      const yDiff = a.bbox.y - b.bbox.y;
      if (Math.abs(yDiff) > 0.005) return yDiff;
      return a.bbox.x - b.bbox.x;
    });

    let currentLine: PdfTextItem[] = [];
    let lastY: number | null = null;

    for (const item of sortedItems) {
      if (lastY !== null && Math.abs(item.bbox.y - lastY) > 0.01) {
        if (currentLine.length > 0) {
          lines.push(buildLine(currentLine, page.pageNumber));
        }
        currentLine = [];
      }
      currentLine.push(item);
      lastY = item.bbox.y;
    }

    if (currentLine.length > 0) {
      lines.push(buildLine(currentLine, page.pageNumber));
    }
  }

  return lines;
}

function buildLine(items: PdfTextItem[], pageNumber: number): RawLine {
  const text = items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
  const xs = items.map(i => i.bbox.x);
  const ys = items.map(i => i.bbox.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const right = Math.max(...items.map(i => i.bbox.x + i.bbox.width));
  const bottom = Math.max(...items.map(i => i.bbox.y + i.bbox.height));
  return {
    text,
    pageNumber,
    bbox: { x, y, width: right - x, height: bottom - y },
  };
}

function looksLikeLineItem(line: string): boolean {
  if (line.length < 5) return false;
  if (line.length > 500) return false;

  if (/^(faktura|nip|regon|iban|bank|konto|rachunek|sprzedawca|nabywca|kupujący|data|termin|miejsce|podpis|razem|suma|do zapłaty|vat|podatek|waluta|kurs)/i.test(line)) {
    return false;
  }

  if (/^(lp\.?|poz\.?|l\.p\.?|nr|item)/i.test(line) && line.length < 20) return false;

  return hasAmountColumn(line);
}

function tryParseLineItem(line: RawLine): ParsedItemResult | null {
  const text = line.text;

  const numbers = text.match(NUMBER_PATTERN);
  if (!numbers || numbers.length < 2) return null;

  const vatRate = detectVatRate(text);

  let description = text;
  let quantity: number | undefined;
  let unitPrice: number | undefined;
  let netAmount: number | undefined;
  let vatAmount: number | undefined;
  let grossAmount: number | undefined;

  if (numbers.length >= 4) {
    const leadingMatch = text.match(/^(.*?)(?:\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+)/);
    if (leadingMatch) {
      description = leadingMatch[1].trim();
    } else {
      const firstNumIdx = text.search(/[\d]/);
      description = text.slice(0, firstNumIdx > 0 ? firstNumIdx : text.length).trim();
    }

    if (numbers.length >= 6) {
      quantity = parseAmount(numbers[numbers.length - 6]);
      unitPrice = parseAmount(numbers[numbers.length - 5]);
      netAmount = parseAmount(numbers[numbers.length - 4]);
      vatAmount = parseAmount(numbers[numbers.length - 2]);
      grossAmount = parseAmount(numbers[numbers.length - 1]);
    } else if (numbers.length >= 5) {
      quantity = parseAmount(numbers[numbers.length - 5]);
      unitPrice = parseAmount(numbers[numbers.length - 4]);
      netAmount = parseAmount(numbers[numbers.length - 3]);
      grossAmount = parseAmount(numbers[numbers.length - 1]);
    } else if (numbers.length >= 4) {
      quantity = parseAmount(numbers[numbers.length - 4]);
      unitPrice = parseAmount(numbers[numbers.length - 3]);
      netAmount = parseAmount(numbers[numbers.length - 2]);
      grossAmount = parseAmount(numbers[numbers.length - 1]);
    } else if (numbers.length >= 3) {
      netAmount = parseAmount(numbers[numbers.length - 2]);
      grossAmount = parseAmount(numbers[numbers.length - 1]);
    }
  } else if (numbers.length >= 2) {
    const firstNumIdx = text.search(/[\d]/);
    description = text.slice(0, firstNumIdx > 0 ? firstNumIdx : text.length).trim();
    netAmount = parseAmount(numbers[numbers.length - 2]);
    grossAmount = parseAmount(numbers[numbers.length - 1]);
  }

  if (!description || description.length < 2) return null;
  if (description.match(/^\d/)) return null;

  const unitMatch = text.match(/(?:szt\.?|kg|kpl\.?|godz\.?|h\b|m\b|km|l\b|opak\.?|usł\.?|rob\.?)/i);
  const unit = unitMatch ? unitMatch[0] : undefined;

  const confidence = computeConfidence({
    hasDescription: !!description,
    hasQuantity: quantity != null,
    hasUnitPrice: unitPrice != null,
    hasNetAmount: netAmount != null,
    hasGrossAmount: grossAmount != null,
    hasVatRate: !!vatRate,
    descriptionLength: description.length,
  });

  return {
    description,
    quantity,
    unit,
    unitPrice,
    netAmount,
    vatRate,
    vatAmount,
    grossAmount,
    rawText: text,
    source: 'pdf_text',
    confidence,
    pageNumber: line.pageNumber,
    bbox: line.bbox,
  };
}

function computeConfidence(fields: {
  hasDescription: boolean;
  hasQuantity: boolean;
  hasUnitPrice: boolean;
  hasNetAmount: boolean;
  hasGrossAmount: boolean;
  hasVatRate: boolean;
  descriptionLength: number;
}): number {
  let score = 0.3;
  if (fields.hasDescription) score += 0.2;
  if (fields.hasQuantity) score += 0.1;
  if (fields.hasUnitPrice) score += 0.1;
  if (fields.hasNetAmount) score += 0.1;
  if (fields.hasGrossAmount) score += 0.1;
  if (fields.hasVatRate) score += 0.1;
  if (fields.descriptionLength >= 5) score += 0.05;
  if (fields.descriptionLength >= 20) score += 0.05;
  return Math.min(1, score);
}

export function extractLineItemsFromText(pdfResult: PdfTextResult): ParsedItemResult[] {
  const lines = splitIntoLines(pdfResult);
  const items: ParsedItemResult[] = [];

  let inItemsSection = false;

  for (const line of lines) {
    const lowerText = line.text.toLowerCase();

    if (/^(lp\.?|poz\.?|l\.p\.?)\s+.*(nazwa|opis|usług|towar)/i.test(line.text)) {
      inItemsSection = true;
      continue;
    }
    if (/^(razem|suma|do zapłaty|podsumowanie)/i.test(line.text)) {
      inItemsSection = false;
      continue;
    }

    if (!inItemsSection && !looksLikeLineItem(line.text)) continue;

    const parsed = tryParseLineItem(line);
    if (parsed) {
      const lastItem = items[items.length - 1];
      if (lastItem && lastItem.pageNumber === line.pageNumber && lastItem.description === parsed.description) {
        continue;
      }
      items.push(parsed);
    }
  }

  return items;
}

export function extractLineItemsFromOcrText(
  text: string,
  pageNumber: number
): ParsedItemResult[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items: ParsedItemResult[] = [];

  for (const lineText of lines) {
    if (!looksLikeLineItem(lineText)) continue;

    const rawLine: RawLine = { text: lineText, pageNumber };
    const parsed = tryParseLineItem(rawLine);
    if (parsed) {
      parsed.source = 'ocr';
      parsed.confidence *= 0.8;
      items.push(parsed);
    }
  }

  return items;
}
