/**
 * KSeF FA(3) XML builder.
 *
 * Maps our internal IssuedInvoiceWithItems structure to the FA(3) logical XML
 * schema published by the Polish Ministry of Finance (Ministerstwo Finansów).
 *
 * Schema reference: FA(3) — http://crd.gov.pl/wzor/2025/06/25/13775/
 *
 * FA(3) Faktura root children order:
 *   Naglowek, Podmiot1, Podmiot2, [Podmiot3], [PodmiotUpowazniony],
 *   Fa, [Stopka], [Zalacznik]
 *
 * FA(3) <Fa> element order (per official XSD sequence):
 *   KodWaluty, P_1, [P_1M], P_2, [WZ], [P_6],
 *   P_13_1, P_14_1, [P_14_1W], P_13_2, P_14_2, [P_14_2W], ... (interleaved per rate),
 *   P_13_5, P_14_5, P_13_6_1, P_13_6_2, P_13_6_3, P_13_7, P_13_8, P_13_9,
 *   P_15, Adnotacje, RodzajFaktury, [PrzyczynaKorekty], [TypKorekty],
 *   [DaneFaKorygowanej], FaWiersz*, [Platnosc], [Zamowienie]
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

function isoDate(d: string | null | undefined): string {
  if (!d) return format(new Date(), 'yyyy-MM-dd');
  try { return format(parseISO(d), 'yyyy-MM-dd'); } catch { return d; }
}

function dec2(n: number): string {
  return n.toFixed(2);
}

function dec4(n: number): string {
  const s = n.toFixed(4);
  return s.replace(/(\.\d\d[1-9]?)0+$/, '$1');
}

// ─── VAT rate mapping for FA(3) ───────────────────────────────────────────────

/**
 * FA(3) P_13/P_14 suffix mapping per VAT rate.
 *
 * The XSD sequence inside <Fa> interleaves P_13_x and P_14_x per rate:
 *   P_13_1, P_14_1, [P_14_1W], P_13_2, P_14_2, [P_14_2W], ...
 *
 * Suffix assignments (per FA(3) schema):
 *   1 = 23%      (P_13_1 / P_14_1)
 *   2 = 8%       (P_13_2 / P_14_2)
 *   3 = 5%       (P_13_3 / P_14_3)
 *   4 = taxi flat (P_13_4 / P_14_4) — not used
 *   5 = 0%       (P_13_5 / P_14_5)
 *   6 = "zw"     (P_13_6_1) — exempt; uses P_13_6_1 not P_13_6
 *   7 = "np"     (P_13_7)    — non-taxable
 *   8 = "oo"     (P_13_8)    — out of scope
 */
interface VatRateMapping {
  p12:           string;
  p13Element:    string;
  p14Element:    string | null;
  hasVat:        boolean;
  order:         number;
}

const VAT_RATE_MAP: Record<VatRate, VatRateMapping> = {
  '23': { p12: '23', p13Element: 'P_13_1', p14Element: 'P_14_1', hasVat: true,  order: 1 },
  '8':  { p12: '8',  p13Element: 'P_13_2', p14Element: 'P_14_2', hasVat: true,  order: 2 },
  '5':  { p12: '5',  p13Element: 'P_13_3', p14Element: 'P_14_3', hasVat: true,  order: 3 },
  '0':  { p12: '0',  p13Element: 'P_13_5', p14Element: 'P_14_5', hasVat: false, order: 5 },
  'zw': { p12: 'zw', p13Element: 'P_13_6_1', p14Element: null,   hasVat: false, order: 6 },
  'np': { p12: 'np', p13Element: 'P_13_7',   p14Element: null,   hasVat: false, order: 7 },
  'oo': { p12: 'oo', p13Element: 'P_13_8',   p14Element: null,   hasVat: false, order: 8 },
};

// FA(3) FormaPlatnosci codes (per Ministerstwo Finansów FA(3) schema):
//   1 = gotówka (cash)
//   2 = karta (card)
//   3 = przelew (transfer)  — note: FA(3) changed this from FA(2)
//   4 = czek (cheque)
//   5 = bon (voucher)
//   6 = kredyt (credit)
//   7 = płatność mobilna (mobile/BLIK)
const PAYMENT_METHOD_MAP: Record<string, string> = {
  cash:     '1',
  card:     '2',
  transfer: '3',
  blik:     '7',
  mobile:   '7',
  other:    '3',
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
      map.set(rate, { rate, mapping, netTotal: item.net_amount, vatTotal: item.vat_amount, grossTotal: item.gross_amount });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.mapping.order - b.mapping.order);
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

/**
 * Build interleaved P_13_x / P_14_x VAT summary lines + P_15.
 *
 * FA(3) XSD sequence: P_13_1, P_14_1, P_13_2, P_14_2, ... (interleaved per rate)
 * Each rate emits its P_13 element, then its P_14 element (if the rate has VAT).
 */
function buildVatSummaryAndP15(inv: IssuedInvoiceWithItems, vatGroups: VatGroup[]): string {
  const lines: string[] = [];

  for (const g of vatGroups) {
    lines.push(`    <${g.mapping.p13Element}>${dec2(g.netTotal)}</${g.mapping.p13Element}>`);
    if (g.mapping.p14Element) {
      lines.push(`    <${g.mapping.p14Element}>${dec2(g.vatTotal)}</${g.mapping.p14Element}>`);
    }
  }

  lines.push(`    <P_15>${dec2(inv.gross_total)}</P_15>`);

  return lines.join('\n');
}

/**
 * Build the Adnotacje block, driven by the VAT rates on the invoice.
 *
 * Element order: P_16 → P_17 → P_18 → P_18A → Zwolnienie → NoweSrodkiTransportu → P_23 → PMarzy
 *
 * When the invoice uses a "zw" (exempt) VAT rate, P_18 must be "1" (exemption
 * applies) and the Zwolnienie block uses P_19 (positive form, with a reason
 * text in P_19). Otherwise P_18=2 and P_19N=1 (does not apply).
 */
function buildAdnotacje(vatGroups: VatGroup[]): string {
  const hasExempt = vatGroups.some(g => g.rate === 'zw');

  const p18      = hasExempt ? '1' : '2';
  const zwolnienie = hasExempt
    ? `      <Zwolnienie>
        <P_19>1</P_19>
        <P_19A>zwolnienie z podatku VAT</P_19A>
      </Zwolnienie>`
    : `      <Zwolnienie>
        <P_19N>1</P_19N>
      </Zwolnienie>`;

  return `    <Adnotacje>
      <P_16>2</P_16>
      <P_17>2</P_17>
      <P_18>${p18}</P_18>
      <P_18A>2</P_18A>
${zwolnienie}
      <NoweSrodkiTransportu>
        <P_22N>1</P_22N>
      </NoweSrodkiTransportu>
      <P_23>2</P_23>
      <PMarzy>
        <P_PMarzyN>1</P_PMarzyN>
      </PMarzy>
    </Adnotacje>`;
}

function buildFaWiersze(inv: IssuedInvoiceWithItems): string {
  return inv.items.map((item) => {
    const rate    = item.vat_rate as VatRate;
    const mapping = VAT_RATE_MAP[rate] ?? VAT_RATE_MAP['23'];
    const discountPct = typeof item.discount_pct === 'string'
      ? parseFloat(item.discount_pct)
      : item.discount_pct;
    const discountLine = discountPct && discountPct > 0
      ? `\n      <P_10>${dec2(discountPct)}</P_10>`
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

function buildPlatnosc(inv: IssuedInvoiceWithItems): string {
  const methodCode = PAYMENT_METHOD_MAP[inv.payment_method] ?? '3';
  const bankLine = inv.seller_bank_account
    ? `\n      <RachunekBankowy>\n        <NrRB>${esc(inv.seller_bank_account)}</NrRB>\n      </RachunekBankowy>`
    : '';
  const dueDateLine = inv.due_date
    ? `\n      <TerminPlatnosci>${esc(isoDate(inv.due_date))}</TerminPlatnosci>`
    : '';

  return `    <Platnosc>
      <FormaPlatnosci>${methodCode}</FormaPlatnosci>${bankLine}${dueDateLine}
    </Platnosc>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Raw FA(3) XML for a single issued invoice. No signing applied. */
export function buildFa2Xml(invoice: IssuedInvoiceWithItems): string {
  const vatGroups = buildVatGroups(invoice.items);

  const naglowek  = buildNaglowek();
  const podmiot1  = buildPodmiot1(invoice);
  const podmiot2  = buildPodmiot2(invoice);
  const vatSum    = buildVatSummaryAndP15(invoice, vatGroups);
  const adnotacje = buildAdnotacje(vatGroups);
  const faWiersze = buildFaWiersze(invoice);
  const platnosc  = buildPlatnosc(invoice);

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
${vatSum}
${adnotacje}
    <RodzajFaktury>VAT</RodzajFaktury>
${faWiersze}
${platnosc}
  </Fa>
</Faktura>`;
}
