/**
 * KSeF FA(2) XML builder.
 *
 * Maps our internal IssuedInvoiceWithItems structure to the FA(2) logical XML
 * schema published by the Polish Ministry of Finance (Ministerstwo Finansów).
 *
 * Schema reference: FA_VAT (2) — https://www.podatki.gov.pl/ksef/dokumenty-do-pobrania/
 *
 * FA(2) key elements produced:
 *   Naglowek          — document header (P_1 date, P_2 invoice number, system flags)
 *   Podmiot1          — seller (DaneIdentyfikacyjne + Adres)
 *   Podmiot2          — buyer  (DaneIdentyfikacyjne + Adres)
 *   Fa                — invoice body
 *     FaWiersz        — one per line item
 *     P_13_*          — net totals by VAT rate
 *     P_14_*          — VAT totals by VAT rate
 *     P_15            — gross total
 *     Adnotacje       — mandatory annotation flags (set to 2 = "not applicable")
 *     Rozliczenie     — settlement totals
 *     Platnosc        — payment details
 */

import type { IssuedInvoiceWithItems } from '@/types/issued-invoice';
import type { VatRate } from '@/types/issued-invoice';
import { format, parseISO } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format a date string to YYYY-MM-DD, safe against null/undefined. */
function isoDate(d: string | null | undefined): string {
  if (!d) return format(new Date(), 'yyyy-MM-dd');
  try { return format(parseISO(d), 'yyyy-MM-dd'); } catch { return d; }
}

/** Format a number to 2 decimal places as required by FA(2). */
function dec2(n: number): string {
  return n.toFixed(2);
}

/** Format quantity to up to 4 decimal places (FA(2) allows 4). */
function dec4(n: number): string {
  const s = n.toFixed(4);
  // Trim trailing zeros but keep at least 2 decimal places
  return s.replace(/(\.\d\d[1-9]?)0+$/, '$1');
}

// ─── VAT rate mapping ─────────────────────────────────────────────────────────
// FA(2) encodes VAT rates differently from our enum.
// Numeric rates → 23 | 8 | 5 | 0
// Special rates  → "ZW" | "NP" | "OO"

interface VatRateMapping {
  /** Value used in FaWiersz/P_12 and P_13_* suffix */
  p12:   string;
  /** Suffix used in P_13_X and P_14_X (numeric rates only) */
  suffix: string | null;
  /** Whether VAT is applicable */
  hasVat: boolean;
}

const VAT_RATE_MAP: Record<VatRate, VatRateMapping> = {
  '23': { p12: '23', suffix: '1',  hasVat: true  },
  '8':  { p12: '8',  suffix: '2',  hasVat: true  },
  '5':  { p12: '5',  suffix: '3',  hasVat: true  },
  '0':  { p12: '0',  suffix: '4',  hasVat: false },
  'zw': { p12: 'ZW', suffix: null, hasVat: false },
  'np': { p12: 'NP', suffix: null, hasVat: false },
  'oo': { p12: 'OO', suffix: null, hasVat: false },
};

// ─── Payment method mapping ───────────────────────────────────────────────────
// FA(2) P_19 values: 1=transfer, 2=card, 3=cash, 4=other

const PAYMENT_METHOD_MAP: Record<string, string> = {
  transfer: '1',
  card:     '2',
  cash:     '3',
  other:    '4',
};

// ─── Address parser ──────────────────────────────────────────────────────────
// Our address is stored as a free-text string. FA(2) requires structured fields.
// We apply best-effort parsing; if we can't parse, we put everything in Ulica.

interface ParsedAddress {
  kodPocztowy: string; // postal code e.g. "00-001"
  miasto:      string; // city
  ulica:       string; // street and number
  kraj:        string; // country code (2 chars), default "PL"
}

function parseAddress(raw: string | null | undefined): ParsedAddress {
  const s = (raw ?? '').trim();

  // Match Polish postal code format: "XX-XXX" or plain "XXXXX"
  const postalMatch = s.match(/\b(\d{2}-\d{3}|\d{5})\b/);
  const kodPocztowy = postalMatch ? postalMatch[1] : '';

  // Everything after the postal code (until end of line/comma) is the city
  let miasto = '';
  let ulica  = s;

  if (postalMatch && postalMatch.index !== undefined) {
    const afterPostal = s.slice(postalMatch.index + postalMatch[0].length).trim();
    // First segment is the city (up to comma or newline)
    const cityMatch = afterPostal.match(/^,?\s*([^,\n]+)/);
    if (cityMatch) {
      miasto = cityMatch[1].trim();
      // Everything before the postal code is the street/number
      ulica = s.slice(0, postalMatch.index).replace(/,\s*$/, '').trim();
    }
  }

  // Detect country code (optional trailing "PL" or "Polska" etc.)
  let kraj = 'PL';
  const countryMatch = s.match(/\b([A-Z]{2})\s*$/);
  if (countryMatch && countryMatch[1] !== 'PL' && countryMatch[1].length === 2) {
    kraj = countryMatch[1];
  }

  return {
    kodPocztowy: kodPocztowy || '00-000',
    miasto:      miasto      || s.split(/[,\n]/)[0].trim() || 'Nieznane',
    ulica:       ulica       || s,
    kraj,
  };
}

// ─── VAT group aggregation ────────────────────────────────────────────────────

interface VatGroup {
  rate:        VatRate;
  mapping:     VatRateMapping;
  netTotal:    number;
  vatTotal:    number;
  grossTotal:  number;
}

function buildVatGroups(items: IssuedInvoiceWithItems['items']): VatGroup[] {
  const map = new Map<VatRate, VatGroup>();
  for (const item of items) {
    const rate    = item.vat_rate as VatRate;
    const mapping = VAT_RATE_MAP[rate] ?? VAT_RATE_MAP['23'];
    const g = map.get(rate);
    if (g) {
      g.netTotal   += item.net_amount;
      g.vatTotal   += item.vat_amount;
      g.grossTotal += item.gross_amount;
    } else {
      map.set(rate, {
        rate,
        mapping,
        netTotal:   item.net_amount,
        vatTotal:   item.vat_amount,
        grossTotal: item.gross_amount,
      });
    }
  }
  return Array.from(map.values());
}

// ─── XML builders ─────────────────────────────────────────────────────────────

function buildNaglowek(inv: IssuedInvoiceWithItems): string {
  // P_1   — invoice date (YYYY-MM-DD)
  // P_1M  — (optional) correction date — omitted for original invoices
  // P_2   — invoice number (arbitrary string, max 256 chars)
  // P_6   — sale/delivery date (if different from issue date)
  // WZ    — 1 = invoice linked to WZ document (n/a here → omit)
  // System — always "1" for electronically issued invoices sent via KSeF

  const p1 = isoDate(inv.issue_date);
  const p6 = inv.sale_date && inv.sale_date !== inv.issue_date
    ? `\n    <P_6>${esc(isoDate(inv.sale_date))}</P_6>`
    : '';

  return `  <Naglowek>
    <KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>2</WariantFormularza>
    <DataWytworzeniaFa>${new Date().toISOString()}</DataWytworzeniaFa>
    <SystemInfo>InvoiceIQ</SystemInfo>
    <P_1>${esc(p1)}</P_1>${p6}
    <P_2>${esc(inv.invoice_number)}</P_2>
  </Naglowek>`;
}

function buildPodmiot1(inv: IssuedInvoiceWithItems): string {
  const addr = parseAddress(inv.seller_address);
  return `  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${esc(inv.seller_nip)}</NIP>
      <PelnaNazwa>${esc(inv.seller_name)}</PelnaNazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>${esc(addr.kraj)}</KodKraju>
      <AdresL1>${esc(addr.ulica)}</AdresL1>
      <AdresL2>${esc(addr.kodPocztowy)} ${esc(addr.miasto)}</AdresL2>
    </Adres>
    ${inv.seller_bank_account ? `<NrRachunku>${esc(inv.seller_bank_account)}</NrRachunku>` : ''}
  </Podmiot1>`;
}

function buildPodmiot2(inv: IssuedInvoiceWithItems): string {
  const addr = parseAddress(inv.buyer_address);
  const nipLine = inv.buyer_nip
    ? `\n      <NIP>${esc(inv.buyer_nip)}</NIP>`
    : '\n      <BrakID>1</BrakID>';

  return `  <Podmiot2>
    <DaneIdentyfikacyjne>${nipLine}
      <PelnaNazwa>${esc(inv.buyer_name)}</PelnaNazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>${esc(addr.kraj)}</KodKraju>
      <AdresL1>${esc(addr.ulica)}</AdresL1>
      <AdresL2>${esc(addr.kodPocztowy)} ${esc(addr.miasto)}</AdresL2>
    </Adres>
    ${inv.buyer_email ? `<Email>${esc(inv.buyer_email)}</Email>` : ''}
  </Podmiot2>`;
}

function buildFaWiersze(inv: IssuedInvoiceWithItems): string {
  return inv.items.map((item) => {
    const rate    = item.vat_rate as VatRate;
    const mapping = VAT_RATE_MAP[rate] ?? VAT_RATE_MAP['23'];

    const discountLine = item.discount_pct
      ? `\n      <P_10>${dec2(item.discount_pct)}</P_10>`
      : '';

    return `    <FaWiersz>
      <NrWierszaFa>${item.position}</NrWierszaFa>
      <P_7>${esc(item.name)}</P_7>
      <P_8A>${esc(item.unit)}</P_8A>
      <P_8B>${dec4(item.quantity)}</P_8B>
      <P_9A>${dec2(item.unit_price_net)}</P_9A>${discountLine}
      <P_11>${dec2(item.net_amount)}</P_11>
      <P_12>${esc(mapping.p12)}</P_12>
    </FaWiersz>`;
  }).join('\n');
}

function buildTotalsAndAdnotacje(inv: IssuedInvoiceWithItems, vatGroups: VatGroup[]): string {
  // P_13_X / P_14_X: net/vat per numeric VAT rate
  const numericGroupLines = vatGroups
    .filter(g => g.mapping.suffix !== null)
    .map(g => {
      const sx = g.mapping.suffix!;
      return `    <P_13_${sx}>${dec2(g.netTotal)}</P_13_${sx}>
    <P_14_${sx}>${dec2(g.vatTotal)}</P_14_${sx}>`;
    }).join('\n');

  // Special (non-VAT) group lines
  const specialGroupLines = vatGroups
    .filter(g => g.mapping.suffix === null)
    .map(g => {
      const tag = g.mapping.p12; // "ZW" | "NP" | "OO"
      return `    <P_13_${tag}>${dec2(g.netTotal)}</P_13_${tag}>`;
    }).join('\n');

  // Adnotacje — boolean flags in FA(2). All default to 2 (= "nie dotyczy" / not applicable)
  // except when the invoice contains reverse-charge items (OO rate → P_106E_2 = 1)
  const hasReverseCharge = vatGroups.some(g => g.rate === 'oo');
  const p106e2 = hasReverseCharge ? '1' : '2';

  return `    ${numericGroupLines}
    ${specialGroupLines}
    <P_15>${dec2(inv.gross_total)}</P_15>
    <Adnotacje>
      <P_16>2</P_16>
      <P_17>2</P_17>
      <P_18>2</P_18>
      <P_18A>2</P_18A>
      <Zwolnienie>
        <P_19>2</P_19>
      </Zwolnienie>
      <NoweSrodkiTransportu>
        <P_22>2</P_22>
      </NoweSrodkiTransportu>
      <P_23>2</P_23>
      <PMarzy>
        <P_PMarzy>2</P_PMarzy>
      </PMarzy>
      <P_106E_2>${p106e2}</P_106E_2>
      <P_106E_3>2</P_106E_3>
    </Adnotacje>`;
}

function buildRozliczenie(inv: IssuedInvoiceWithItems, vatGroups: VatGroup[]): string {
  // Rozliczenie contains the payment settlement totals
  const totalNetAllRates = vatGroups.reduce((s, g) => s + g.netTotal, 0);
  const totalVatAllRates = vatGroups.reduce((s, g) => s + g.vatTotal, 0);

  return `    <Rozliczenie>
      <LacznaKwotaAktywow>${dec2(totalNetAllRates)}</LacznaKwotaAktywow>
      <LacznaKwotaVAT>${dec2(totalVatAllRates)}</LacznaKwotaVAT>
    </Rozliczenie>`;
}

function buildPlatnosc(inv: IssuedInvoiceWithItems): string {
  const methodCode = PAYMENT_METHOD_MAP[inv.payment_method] ?? '1';
  const dueDateLine = inv.due_date
    ? `\n      <TerminPlatnosci>${isoDate(inv.due_date)}</TerminPlatnosci>`
    : '';
  const bankLine = inv.seller_bank_account
    ? `\n      <RachunekBankowy>
        <NrRB>${esc(inv.seller_bank_account)}</NrRB>
      </RachunekBankowy>`
    : '';

  return `    <Platnosc>
      <TerminPlatnosci>${isoDate(inv.due_date ?? inv.issue_date)}</TerminPlatnosci>
      <FormaPlatnosci>${methodCode}</FormaPlatnosci>${dueDateLine}${bankLine}
      <Waluta>${esc(inv.currency ?? 'PLN')}</Waluta>
    </Platnosc>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Raw FA(2) XML for a single issued invoice. No signing applied. */
export function buildFa2Xml(invoice: IssuedInvoiceWithItems): string {
  const vatGroups = buildVatGroups(invoice.items);

  const naglowek   = buildNaglowek(invoice);
  const podmiot1   = buildPodmiot1(invoice);
  const podmiot2   = buildPodmiot2(invoice);
  const faWiersze  = buildFaWiersze(invoice);
  const totals     = buildTotalsAndAdnotacje(invoice, vatGroups);
  const rozliczenie = buildRozliczenie(invoice, vatGroups);
  const platnosc   = buildPlatnosc(invoice);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://crd.gov.pl/wzor/2023/06/29/12648/ http://crd.gov.pl/wzor/2023/06/29/12648/schemat.xsd">
${naglowek}
${podmiot1}
${podmiot2}
  <Fa>
    <KodWaluty>${esc(invoice.currency ?? 'PLN')}</KodWaluty>
    <P_1>${esc(isoDate(invoice.issue_date))}</P_1>
    <P_2>${esc(invoice.invoice_number)}</P_2>
    <P_15>${invoice.gross_total.toFixed(2)}</P_15>
${faWiersze}
${totals}
${rozliczenie}
${platnosc}
  </Fa>
</Faktura>`;
}
