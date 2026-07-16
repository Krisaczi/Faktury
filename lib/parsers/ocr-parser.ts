import { extractLineItemsFromOcrText } from './line-item-extractor';
import type { ParsedItemResult } from '@/types/invoice-item';

export async function parseInvoiceImageWithOcr(
  imageBuffer: Buffer,
  pageNumber = 1
): Promise<{ items: ParsedItemResult[]; rawText: string; error?: string }> {
  try {
    const tesseract = await import('tesseract.js');
    const worker = await tesseract.createWorker('pol+eng');
    const result = await worker.recognize(imageBuffer);
    await worker.terminate();

    const rawText = result.data.text;
    const items = extractLineItemsFromOcrText(rawText, pageNumber);

    return { items, rawText };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { items: [], rawText: '', error: message };
  }
}
