/**
 * KSeF FA(3) XML builder.
 *
 * Maps our internal IssuedInvoiceWithItems structure to the FA(3) logical XML
 * schema published by the Polish Ministry of Finance (Ministerstwo Finansów).
 *
 * Schema reference: FA(3) — http://crd.gov.pl/wzor/2025/06/25/13775/
 *
 * FA(3) key elements produced:
 *   Naglowek          — document header (form code, creation date, system info)
 *   Podmiot1          — seller (DaneIdentyfikacyjne + Adres)
 *   Podmiot2          — buyer  (DaneIdentyfikacyjne + Adres)
 *   Fa                — invoice body
 *     P_1, P_2        — issue date, invoice number
 *     RodzajFaktury   — invoice type (VAT, KOR, ZAL, etc.)
 *     FaWiersz        — one per line item
 *     FaWierszCtrl    — control summary (line count + net total)
 *     P_13_*          — net totals by VAT rate
 *     P_14_*          — VAT totals by VAT rate
 *     P_15            — gross total
 *     Adnotacje       — mandatory annotation flags
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

/** Format a number to 2 decimal places as required by FA(3). */
function dec2(n: number): string {
  return n.toFixed(2);
}

/** Format quantity to up to 4 decimal places (FA(3) allows 4). */
function dec4(n: number): string {
  const s = n.toFixed(4);
  return s.replace(/(\.\d\d[1-9]?)0+$/, '$1');
}

// ─── VAT rate mapping for FA(3) ───────────────────────────────────────────────
// FA(3) P_13 field indices:
//   1 = 23%    2 = 8%    3 = 5%
//   4 = special (ryczałt taxi etc.)
//   5 = 0%     6 = NP (poza zakresem)    7 = ZW (zwolniona)
//   8 = OO (odwrotne obciążenie)   9 = marża   10 = OSS/IOSS   11 = pozostałe

interface VatRateMapping {
  /** Value used in FaWiersz/P_12 */
  p12: string;
  /** Suffix used in P_13_X and P_14_X */
  suffix: string;
  /** Whether VAT is applicable (determines if P_14 counterpart exists) */
  hasVat: boolean;
}

const VAT_RATE_MAP: Record<VatRate, VatRateMapping> = {
  '23': { p12: '23', suffix: '1', hasVat: true  },
  '8':  { p12: '8',  suffix: '2', hasVat: true  },
  '5':  { p12: '5',  suffix: '3', hasVat: true  },
  '0':  { p12: '0',  suffix: '5', hasVat: false },
  'zw': { p12: 'zw', suffix: '7', hasVat: false },
  'np': { p12: 'np', suffix: '6', hasVat: false },
  'oo': { p12: 'oo', suffix: '8', hasVat: false },
};

// ─── Payment method mapping ───────────────────────────────────────────────────

const PAYMENT_METHOD_MAP: Record<string, string> = {
  transfer: '1',
  card:     '2',
  cash:     '3',
  other:    '4',
};

// ─── Address parser ──────────────────────────────────────────────────────────

interface ParsedAddress {
  kodPocztowy: string;
  miasto:      string;
  ulica:       string;
  kraj:        string;
}

function parseAddress(raw: string | null | undefined): ParsedAddress {
  const s = (raw ?? '').trim();

  const postalMatch = s.match(/\b(\d{2}-\d{3}|\d{5})\b/);
  const kodPocztowy = postalMatch ? postalMatch[1] : '';

  let miasto = '';
  let ulica  = s;

  if (postalMatch && postalMatch.index !== undefined) {
    const afterPostal = s.slice(postalMatch.index + postalMatch[0].length).trim();
    const cityMatch = afterPostal.match(/^,?\s*([^,\n]+)/);
    if (cityMatch) {
      miasto = cityMatch[1].trim();
      ulica = s.slice(0, postalMatch.index).replace(/,\s*$/, '').trim();
    }
  }

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

function buildNaglowek(): string {
  return `  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>${new Date().toISOString()}</DataWytworzeniaFa>
    <SystemInfo>InvoiceIQ</SystemInfo>
  </Naglowek>`;
}

function buildPodmiot1(inv: IssuedInvoiceWithItems): string {
  const addr = parseAddress(inv.seller_address);
  return `  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${esc(inv.seller_nip)}</NIP>
      <Nazwa>${esc(inv.seller_name)}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>${esc(addr.kraj)}</KodKraju>
      <AdresL1>${esc(addr.ulica)}</AdresL1>
      <AdresL2>${esc(addr.kodPocztowy)} ${esc(addr.miasto)}</AdresL2>
    </Adres>
  </Podmiot1>`;
}

function buildPodmiot2(inv: IssuedInvoiceWithItems): string {
  const addr = parseAddress(inv.buyer_address);
  const nipLine = inv.buyer_nip
    ? `\n      <NIP>${esc(inv.buyer_nip)}</NIP>`
    : '\n      <BrakID>1</BrakID>';

  return `  <Podmiot2>
    <DaneIdentyfikacyjne>${nipLine}
      <Nazwa>${esc(inv.buyer_name)}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>${esc(addr.kraj)}</KodKraju>
      <AdresL1>${esc(addr.ulica)}</AdresL1>
      <AdresL2>${esc(addr.kodPocztowy)} ${esc(addr.miasto)}</AdresL2>
    </Adres>
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

function buildFaWierszCtrl(inv: IssuedInvoiceWithItems): string {
  const itemCount = inv.items.length;
  const totalNet = inv.items.reduce((s, i) => s + i.net_amount, 0);
  return `    <FaWierszCtrl>
      <LiczbaWierszyFaktury>${itemCount}</LiczbaWierszyFaktury>
      <WartoscWierszyFaktury>${dec2(totalNet)}</WartoscWierszyFaktury>
    </FaWierszCtrl>`;
}

function buildTotalsAndAdnotacje(inv: IssuedInvoiceWithItems, vatGroups: VatGroup[]): string {
  // P_13_X: net per VAT rate, P_14_X: VAT amount per rate
  const groupLines = vatGroups
    .map(g => {
      const sx = g.mapping.suffix;
      const p13 = `    <P_13_${sx}>${dec2(g.netTotal)}</P_13_${sx}>`;
      const p14 = g.mapping.hasVat
        ? `\n    <P_14_${sx}>${dec2(g.vatTotal)}</P_14_${sx}>`
        : '';
      return p13 + p14;
    }).join('\n');

  const hasReverseCharge = vatGroups.some(g => g.rate === 'oo');
  const p106e2 = hasReverseCharge ? '1' : '2';

  const hasExempt = vatGroups.some(g => g.rate === 'zw');

  return `    ${groupLines}
    <P_15>${dec2(inv.gross_total)}</P_15>
    <Adnotacje>
      <P_16>2</P_16>
      <P_17>2</P_17>
      <P_18>2</P_18>
      <P_18A>2</P_18A>${hasExempt ? '\n      <Zwolnienie>\n        <P_19>1</P_19>\n      </Zwolnienie>' : '\n      <Zwolnienie>\n        <P_19>2</P_19>\n      </Zwolnienie>'}
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
  const totalNetAllRates = vatGroups.reduce((s, g) => s + g.netTotal, 0);
  const totalVatAllRates = vatGroups.reduce((s, g) => s + g.vatTotal, 0);

  return `    <Rozliczenie>
      <LacznaKwotaAktywow>${dec2(totalNetAllRates)}</LacznaKwotaAktywow>
      <LacznaKwotaVAT>${dec2(totalVatAllRates)}</LacznaKwotaVAT>
    </Rozliczenie>`;
}

function buildPlatnosc(inv: IssuedInvoiceWithItems): string {
  const methodCode = PAYMENT_METHOD_MAP[inv.payment_method] ?? '1';
  const bankLine = inv.seller_bank_account
    ? `\n      <RachunekBankowy>\n        <NrRB>${esc(inv.seller_bank_account)}</NrRB>\n      </RachunekBankowy>`
    : '';

  return `    <Platnosc>
      <FormaPlatnosci>${methodCode}</FormaPlatnosci>
      <TerminPlatnosci>${isoDate(inv.due_date ?? inv.issue_date)}</TerminPlatnosci>${bankLine}
      <Waluta>${esc(inv.currency ?? 'PLN')}</Waluta>
    </Platnosc>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Raw FA(3) XML for a single issued invoice. No signing applied. */
export function buildFa2Xml(invoice: IssuedInvoiceWithItems): string {
  const vatGroups = buildVatGroups(invoice.items);

  const naglowek    = buildNaglowek();
  const podmiot1    = buildPodmiot1(invoice);
  const podmiot2    = buildPodmiot2(invoice);
  const faWiersze   = buildFaWiersze(invoice);
  const faWierszCtrl = buildFaWierszCtrl(invoice);
  const totals      = buildTotalsAndAdnotacje(invoice, vatGroups);
  const rozliczenie = buildRozliczenie(invoice, vatGroups);
  const platnosc    = buildPlatnosc(invoice);

  const p6 = invoice.sale_date && invoice.sale_date !== invoice.issue_date
    ? `\n    <P_6>${esc(isoDate(invoice.sale_date))}</P_6>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://crd.gov.pl/wzor/2025/06/25/13775/ http://crd.gov.pl/wzor/2025/06/25/13775/schemat.xsd">
${naglowek}
${podmiot1}
${podmiot2}
  <Fa>
    <KodWaluty>${esc(invoice.currency ?? 'PLN')}</KodWaluty>
    <P_1>${esc(isoDate(invoice.issue_date))}</P_1>
    <P_2>${esc(invoice.invoice_number)}</P_2>${p6}
    <RodzajFaktury>VAT</RodzajFaktury>
${faWiersze}
${faWierszCtrl}
${totals}
${rozliczenie}
${platnosc}
  </Fa>
</Faktura>`;
}
