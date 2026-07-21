/**
 * IBAN validation and formatting utilities.
 *
 * Implements ISO 13616 mod-97 checksum validation without external dependencies.
 */

/** IBAN lengths per country code (ISO 13616). */
const COUNTRY_LENGTHS: Record<string, number> = {
  AL: 28, AD: 24, AT: 20, AZ: 28, BE: 16, BH: 22, BA: 20, BR: 29,
  BG: 22, CR: 22, HR: 21, CY: 28, CZ: 24, DK: 18, DO: 28, EE: 20,
  FO: 18, FI: 18, FR: 27, GE: 22, DE: 22, GI: 23, GR: 27, GL: 18,
  GT: 28, HU: 28, IS: 26, IE: 22, IL: 23, IT: 27, JO: 30, KZ: 20,
  XK: 20, KW: 30, LV: 21, LB: 28, LI: 21, LT: 20, LU: 20, MK: 19,
  MT: 31, MR: 27, MU: 30, MC: 27, MD: 24, ME: 22, NL: 18,
  NO: 15, PK: 24, PS: 29, PL: 28, PT: 25, QA: 29, RO: 24, SM: 27,
  SA: 24, RS: 22, SK: 24, SI: 19, ES: 24, SE: 24, CH: 21, TN: 24,
  TR: 26, AE: 23, GB: 22, VG: 24,
};

/** Strip whitespace and uppercase. */
export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/** Format IBAN in 4-character groups for display. */
export function formatIban(input: string): string {
  const clean = normalizeIban(input);
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

/** Show only the last 4 characters, mask the rest. */
export function maskIban(input: string): string {
  const clean = normalizeIban(input);
  if (clean.length < 8) return clean;
  const last4 = clean.slice(-4);
  const prefix = clean.slice(0, 2); // country code
  return `${prefix} •••• •••• ${last4}`;
}

/**
 * Validate an IBAN using ISO 13616 mod-97 algorithm.
 * Returns an error key (for i18n) or null if valid.
 */
export function validateIban(input: string): string | null {
  const iban = normalizeIban(input);

  if (!iban) return 'IBAN jest wymagany.';
  if (iban.length < 15) return 'IBAN jest zbyt krótki.';
  if (iban.length > 34) return 'IBAN jest zbyt długi.';

  const cc = iban.slice(0, 2);
  if (!/^[A-Z]{2}$/.test(cc)) return 'IBAN musi zaczynać się od kodu kraju.';

  const expectedLen = COUNTRY_LENGTHS[cc];
  if (expectedLen && iban.length !== expectedLen) {
    return `IBAN dla kraju ${cc} musi mieć ${expectedLen} znaków.`;
  }

  // Rearrange: move first 4 chars to end
  const rearranged = iban.slice(4) + iban.slice(0, 4);

  // Convert letters to numbers (A=10, B=11, ...)
  const numericStr = rearranged.replace(/[A-Z]/g, (ch) =>
    String(ch.charCodeAt(0) - 55),
  );

  // mod-97 check — process in chunks to avoid BigInt (tsconfig < ES2020)
  try {
    let remainder = 0;
    for (let i = 0; i < numericStr.length; i++) {
      const digit = parseInt(numericStr[i], 10);
      if (isNaN(digit)) throw new Error('invalid');
      remainder = (remainder * 10 + digit) % 97;
    }
    if (remainder !== 1) return 'Nieprawidłowy numer IBAN (błędna suma kontrolna).';
  } catch {
    return 'Nieprawidłowy format IBAN.';
  }

  return null;
}

/**
 * Validate BIC/SWIFT code format.
 * BIC is 8 or 11 characters: 4 letters (bank) + 2 letters (country) + 2 alphanumerics (location) + optional 3 alphanumerics (branch).
 */
export function validateBic(input: string): string | null {
  const bic = input.replace(/\s+/g, '').toUpperCase();
  if (!bic) return null; // BIC is optional
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) {
    return 'Nieprawidłowy format BIC/SWIFT.';
  }
  return null;
}

/** Extract the bank name guess from a PL IBAN (first 8 digits after PL = bank sort code). */
export function guessBankNameFromPlIban(iban: string): string | null {
  const clean = normalizeIban(iban);
  if (!clean.startsWith('PL') || clean.length < 10) return null;
  return null; // Real implementation would use a PL bank sort code lookup table
}
