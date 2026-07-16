import type { ParsedItemResult, ParseResult } from '@/types/invoice-item';
import { parseXmlInvoices, type ParsedLineItem } from './xml-invoice-parser';
import { extractPdfText } from './pdf-text-parser';
import { extractLineItemsFromText } from './line-item-extractor';

function xmlItemsToParsedItems(items: ParsedLineItem[]): ParsedItemResult[] {
  return items.map((li) => ({
    description: li.name ?? li.description ?? '',
    quantity: li.quantity,
    unit: li.unit,
    unitPrice: li.unitPrice,
    netAmount: li.netAmount,
    vatRate: li.vatRate,
    vatAmount: li.vatAmount,
    grossAmount: li.grossAmount,
    rawText: li.name ?? li.description,
    source: 'ksef_xml' as const,
    confidence: 1.0,
  }));
}

function averageConfidence(items: ParsedItemResult[]): number {
  if (items.length === 0) return 0;
  return items.reduce((s, i) => s + i.confidence, 0) / items.length;
}

async function runOcrFallback(
  fileContent: Buffer,
  pageNumber: number,
  errors: string[]
): Promise<ParsedItemResult[]> {
  try {
    const { parseInvoiceImageWithOcr } = await import('./ocr-parser');
    const ocrResult = await parseInvoiceImageWithOcr(fileContent, pageNumber);
    if (ocrResult.error) {
      errors.push(`OCR failed: ${ocrResult.error}`);
    }
    if (ocrResult.items.length > 0) {
      return ocrResult.items;
    }
    errors.push('OCR found no line items');
  } catch (err) {
    errors.push(`OCR fallback failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return [];
}

export async function parseInvoiceItems(
  invoiceId: string,
  fileContent: Buffer | string,
  contentType: string
): Promise<ParseResult> {
  const errors: string[] = [];

  if (contentType === 'application/xml' || contentType === 'text/xml' || contentType.includes('xml')) {
    try {
      const xmlText = typeof fileContent === 'string' ? fileContent : fileContent.toString('utf-8');
      const result = await parseXmlInvoices(xmlText);
      if (result.invoices.length > 0 && result.invoices[0].lineItems?.length) {
        const items = xmlItemsToParsedItems(result.invoices[0].lineItems);
        return {
          items,
          source: 'ksef_xml',
          averageConfidence: 1.0,
          errors: result.errors.map(e => e.message),
        };
      }
      errors.push('XML parsed but no line items found');
    } catch (err) {
      errors.push(`XML parsing failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (contentType === 'application/pdf' || contentType.includes('pdf')) {
    try {
      const pdfBuffer = typeof fileContent === 'string'
        ? Buffer.from(fileContent, 'utf-8')
        : new Uint8Array(fileContent);
      const pdfResult = await extractPdfText(pdfBuffer);
      const items = extractLineItemsFromText(pdfResult);

      if (items.length > 0 && averageConfidence(items) >= 0.5) {
        return {
          items,
          source: 'pdf_text',
          averageConfidence: averageConfidence(items),
          errors,
        };
      }

      if (items.length === 0) {
        errors.push('PDF text extraction found no line items, attempting OCR fallback');
      } else {
        errors.push(`PDF text extraction confidence too low (${(averageConfidence(items) * 100).toFixed(0)}%), attempting OCR fallback`);
      }

      const ocrItems = await runOcrFallback(
        typeof fileContent === 'string' ? Buffer.from(fileContent) : fileContent,
        1,
        errors
      );
      if (ocrItems.length > 0) {
        return {
          items: ocrItems,
          source: 'ocr',
          averageConfidence: averageConfidence(ocrItems),
          errors,
        };
      }
    } catch (err) {
      errors.push(`PDF parsing failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (contentType.startsWith('image/')) {
    const ocrItems = await runOcrFallback(
      typeof fileContent === 'string' ? Buffer.from(fileContent) : fileContent,
      1,
      errors
    );
    if (ocrItems.length > 0) {
      return {
        items: ocrItems,
        source: 'ocr',
        averageConfidence: averageConfidence(ocrItems),
        errors,
      };
    }
  }

  return { items: [], source: 'manual', averageConfidence: 0, errors };
}

export { parseXmlInvoices } from './xml-invoice-parser';
