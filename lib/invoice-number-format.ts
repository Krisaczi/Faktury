/**
 * Pure formatting / parsing helpers for invoice numbers.
 * No I/O, no framework imports — safe to use in tests, edge functions, and
 * client components.
 *
 * Format: YYYY/MM/NNN
 *   YYYY = 4-digit calendar year
 *   MM   = 2-digit month (01–12)
 *   NNN  = 3-digit (or more) zero-padded sequence number, resets each year
 *
 * Examples:  2026/05/001  →  2026/05/999  →  2026/05/1000
 *            2027/01/001  (counter resets at start of new year)
 */

const INVOICE_NUMBER_RE = /^(\d{4})\/(\d{2})\/(\d{3,})$/;

/**
 * Format constituent parts into an invoice number string.
 * Mirrors the format produced by the `generate_invoice_number` Postgres function.
 */
export function formatInvoiceNumber(year: number, month: number, seq: number): string {
  return `${year}/${String(month).padStart(2, '0')}/${String(seq).padStart(3, '0')}`;
}

/**
 * Parse a formatted invoice number back into its constituent parts.
 * Returns `null` if the string does not match the expected pattern.
 */
export function parseInvoiceNumber(invoiceNumber: string): {
  year: number;
  month: number;
  seq: number;
} | null {
  const match = invoiceNumber.match(INVOICE_NUMBER_RE);
  if (!match) return null;
  return {
    year:  parseInt(match[1], 10),
    month: parseInt(match[2], 10),
    seq:   parseInt(match[3], 10),
  };
}

/**
 * Returns `true` when `value` matches the invoice number format exactly.
 */
export function isValidInvoiceNumber(value: string): boolean {
  return INVOICE_NUMBER_RE.test(value);
}
