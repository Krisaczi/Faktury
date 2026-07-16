import type { BBox } from '@/types/invoice-item';
import type { PdfTextResult, PdfTextItem } from '@/lib/parsers/pdf-text-parser';
import type { ParsedCharge } from '@/lib/parsers/xml-invoice-parser';

export interface ChargeMapping {
  pageNumber: number | null;
  bbox: BBox | null;
  confidence: number;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

const MATCH_THRESHOLD = 0.65;
const AMOUNT_MATCH_THRESHOLD = 0.85;

function findBestMatch(
  haystack: PdfTextItem[],
  needle: string,
  amount: number
): { item: PdfTextItem; score: number } | null {
  let best: { item: PdfTextItem; score: number } | null = null;

  for (const item of haystack) {
    const reasonScore = similarity(needle, item.str);
    const amountStr = amount.toFixed(2);
    const amountScore = similarity(amountStr, item.str);

    const score = Math.max(reasonScore, amountScore * AMOUNT_MATCH_THRESHOLD);

    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { item, score };
    }
  }

  return best;
}

/**
 * Maps parsed KSeF Rozliczenie charges to PDF text-layer positions.
 * For each charge, searches all PDF pages for text matching the reason (Powod)
 * or amount (Kwota). Returns page_number + bbox for highlighting on hover.
 *
 * Charges that can't be matched still get persisted; mapping is null.
 */
export function mapChargesToPdf(
  charges: ParsedCharge[],
  pdfText: PdfTextResult
): ChargeMapping[] {
  return charges.map((charge) => {
    let bestMatch: { item: PdfTextItem; score: number } | null = null;

    for (const page of pdfText.pages) {
      const match = findBestMatch(page.items, charge.reason, charge.amount);
      if (match && (!bestMatch || match.score > bestMatch.score)) {
        bestMatch = match;
      }
    }

    if (bestMatch) {
      return {
        pageNumber: bestMatch.item.pageNumber,
        bbox: bestMatch.item.bbox,
        confidence: bestMatch.score,
      };
    }

    return { pageNumber: null, bbox: null, confidence: 0 };
  });
}
