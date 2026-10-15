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
 *   KodWaluty, P_1, [P_1M], P_2, [WZ],
 *   choice: [P_6] | [OkresFa],
 *   [seq: P_13_1, P_14_1, [P_14_1W]],
 *   [seq: P_13_2, P_14_2, [P_14_2W]],
 *   [seq: P_13_3, P_14_3, [P_14_3W]],
 *   [seq: P_13_4, P_14_4, [P_14_4W]],
 *   [seq: P_13_5, [P_14_5]],
 *   [P_13_6_1], [P_13_6_2], [P_13_6_3],
 *   [P_13_7], [P_13_8], [P_13_9], [P_13_10], [P_13_11],
 *   P_15, [KursWalutyZ], Adnotacje, RodzajFaktury,
 *   FaWiersz*, [Rozliczenie], [Platnosc], [WarunkiTransakcji], [Zamowienie]
 */

import type { IssuedInvoiceWithItems } from '@/types/issued-invoice';
import type { VatRate, DocumentType } from '@/types/issued-invoice';
import { KSEF_RODZAJ_FAKTURY } from '@/types/issued-invoice';
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
 * FA(3) P_12 (TStawkaPodatku) allowed values:
 *   23, 22, 8, 7, 5, 4, 3, 0 KR, 0 WDT, 0 EX, zw, oo, np I, np II
 *
 * P_13/P_14 element mapping per VAT rate. The XSD wraps each taxable rate
 * (23%, 8%, 5%, 4%, taxi) in an optional <sequence>, so we only emit the
 * sequences for rates that appear on the invoice.
 *
 * Suffix assignments (per FA(3) official information sheet):
 *   1 = 23%      (P_13_1 / P_14_1)
 *   2 = 8%       (P_13_2 / P_14_2)
 *   3 = 5%       (P_13_3 / P_14_3)
 *   4 = taxi flat (P_13_4 / P_14_4) — not used
 *   5 = 0%       (P_13_5 / P_14_5)
 *   6_1 = 0% excluding WDT/export (P_13_6_1)
 *   7 = "zw"     (P_13_7)    — VAT exempt (zwolnione od podatku)
 *   8 = "np"/"oo" (P_13_8)   — non-taxable / out of scope (nie podlega)
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
  '0':  { p12: '0',  p13Element: 'P_13_5', p14Element: null,     hasVat: false, order: 5 },
  'zw': { p12: 'zw', p13Element: 'P_13_7',   p14Element: null,   hasVat: false, order: 7 },
  'np': { p12: 'np', p13Element: 'P_13_8',   p14Element: null,   hasVat: false, order: 8 },
  'oo': { p12: 'oo', p13Element: 'P_13_8',   p14Element: null,   hasVat: false, order: 8 },
};

// FA(3) FormaPlatnosci codes (per official FA(3) documentation):
//   1 = gotówka, 2 = karta, 3 = bon, 4 = czek,
//   5 = kredyt, 6 = przelew, 7 = płatność mobilna
const PAYMENT_METHOD_MAP: Record<string, string> = {
  cash:     '1',
  card:     '2',
  transfer: '6',
  blik:     '7',
  mobile:   '7',
  other:    '6',
};

// ─── Address parser ──────────────────────────────────────────────────────────

interface ParsedAddress {
  kodPocztowy: string;
  miasto:      string;
  ulica:       string;
  kraj:        string;
}

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'polska':   'PL',
  'niemcy':   'DE',
  'francja':  'FR',
  'czechy':   'CZ',
  'slowacja': 'SK',
  'ukraina':  'UA',
  'litwa':    'LT',
  'lotwa':    'LV',
  'estonia':  'EE',
  'holandia': 'NL',
  'belgia':   'BE',
  'austria':  'AT',
  'wegry':    'HU',
  'rumunia':  'RO',
  'bulgaria': 'BG',
  'grecja':   'GR',
  'hiszpania':'ES',
  'wlochy':   'IT',
  'portugalia':'PT',
  'irlandia': 'IE',
  'szwecja':  'SE',
  'dania':    'DK',
  'finlandia':'FI',
  'chorwacja':'HR',
  'slowenia': 'SI',
  'luksemburg':'LU',
  'malta':    'MT',
};

function parseAddress(raw: string | null | undefined): ParsedAddress {
  const s = (raw ?? '').trim();
  const postalMatch = s.match(/\b(\d{2}-\d{3}|\d{5})\b/);
  const kodPocztowy = postalMatch ? postalMatch[1] : '';
  let miasto = '';
  let ulica  = s;
  let kraj   = 'PL';

  if (postalMatch && postalMatch.index !== undefined) {
    const afterPostal = s.slice(postalMatch.index + postalMatch[0].length).trim();
    const segments = afterPostal.split(/,\s*/).filter(Boolean);
    for (const seg of segments) {
      const lower = seg.trim().toLowerCase();
      if (COUNTRY_NAME_TO_CODE[lower]) {
        kraj = COUNTRY_NAME_TO_CODE[lower].toUpperCase();
      } else if (!miasto) {
        miasto = seg.trim();
      }
    }
    ulica = s.slice(0, postalMatch.index).replace(/,\s*$/, '').trim();
  }

  const countryMatch = s.match(/\b([A-Z]{2})\s*$/);
  if (countryMatch && countryMatch[1].length === 2) {
    kraj = countryMatch[1];
  }

  return {
    kodPocztowy: kodPocztowy || '00-000',
    miasto:      miasto      || 'Nieznane',
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
    <JST>2</JST>
    <GV>2</GV>
  </Podmiot2>`;
}

/**
 * Build the P_13/P_14 VAT summary + P_15 per the FA(3) XSD.
 *
 * Each taxable rate (23%, 8%, 5%, taxi, 0%) is wrapped in an optional <sequence>.
 * We only emit the sequences for rates that appear on the invoice.
 *
 * After those sequences, the XSD has standalone optional elements:
 *   P_13_6_1 (0% non-WDT/non-export), P_13_6_2, P_13_6_3,
 *   P_13_7 (zw — exempt), P_13_8 (np/oo — non-taxable),
 *   P_13_9, P_13_10, P_13_11 — all optional
 *
 * Then P_15 (total gross) is required.
 *
 * Note: FA(3) does NOT have P_14_9 (total VAT). The total net is P_13_9.
 */
function buildVatSummaryAndP15(inv: IssuedInvoiceWithItems, vatGroups: VatGroup[]): string {
  const rateMap = new Map<VatRate, VatGroup>();
  for (const g of vatGroups) rateMap.set(g.rate, g);

  const get = (rate: VatRate, field: 'netTotal' | 'vatTotal'): number =>
    rateMap.get(rate)?.[field] ?? 0;

  const lines: string[] = [];

  // 23% — optional sequence: P_13_1, P_14_1
  if (rateMap.has('23')) {
    lines.push(`    <P_13_1>${dec2(get('23', 'netTotal'))}</P_13_1>`);
    lines.push(`    <P_14_1>${dec2(get('23', 'vatTotal'))}</P_14_1>`);
  }

  // 8% — optional sequence: P_13_2, P_14_2
  if (rateMap.has('8')) {
    lines.push(`    <P_13_2>${dec2(get('8', 'netTotal'))}</P_13_2>`);
    lines.push(`    <P_14_2>${dec2(get('8', 'vatTotal'))}</P_14_2>`);
  }

  // 5% — optional sequence: P_13_3, P_14_3
  if (rateMap.has('5')) {
    lines.push(`    <P_13_3>${dec2(get('5', 'netTotal'))}</P_13_3>`);
    lines.push(`    <P_14_3>${dec2(get('5', 'vatTotal'))}</P_14_3>`);
  }

  // 0% — optional sequence: P_13_5, [P_14_5]
  if (rateMap.has('0')) {
    lines.push(`    <P_13_5>${dec2(get('0', 'netTotal'))}</P_13_5>`);
  }

  // P_13_7 = VAT exempt (zwolnione od podatku)
  if (rateMap.has('zw')) {
    lines.push(`    <P_13_7>${dec2(get('zw', 'netTotal'))}</P_13_7>`);
  }

  // P_13_8 = non-taxable / out of scope (nie podlega) — np and oo share this field
  const nonTaxableTotal = get('np', 'netTotal') + get('oo', 'netTotal');
  if (nonTaxableTotal > 0) {
    lines.push(`    <P_13_8>${dec2(nonTaxableTotal)}</P_13_8>`);
  }

  // P_13_9 = total net across all rates
  lines.push(`    <P_13_9>${dec2(inv.net_total)}</P_13_9>`);

  // P_15 = total gross (required)
  lines.push(`    <P_15>${dec2(inv.gross_total)}</P_15>`);

  return lines.join('\n');
}

/**
 * Build the Adnotacje block.
 *
 * Element order: P_16 → P_17 → P_18 → P_18A → Zwolnienie → NoweSrodkiTransportu → P_23 → PMarzy
 * All eight are required (minOccurs=1).
 */
function buildAdnotacje(inv: IssuedInvoiceWithItems, vatGroups: VatGroup[]): string {
  const hasExempt = vatGroups.some(g => g.rate === 'zw');

  // P_18=1 means reverse charge; P_18=2 means not applicable
  const p18      = '2';
  const exemptionReason = inv.notes?.trim()
    ? inv.notes.trim()
    : 'zwolnienie z podatku VAT';
  const zwolnienie = hasExempt
    ? `      <Zwolnienie>
        <P_19>1</P_19>
        <P_19A>${esc(exemptionReason)}</P_19A>
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

/**
 * Build the Platnosc block per FA(3) XSD.
 *
 * Sequence: [Zaplata choice], [TerminPlatnosci], [FormaPlatnosci | PlatnoscInna],
 *           [RachunekBankowy], [RachunekBankowyFaktora], [Skonto], [LinkDoPlatnosci], [IPKSeF]
 */
function buildPlatnosc(inv: IssuedInvoiceWithItems): string {
  const methodCode = PAYMENT_METHOD_MAP[inv.payment_method] ?? '6';

  const dueDateLine = inv.due_date
    ? `\n      <TerminPlatnosci>\n        <Termin>${esc(isoDate(inv.due_date))}</Termin>\n      </TerminPlatnosci>`
    : '';

  const rawAccount = inv.seller_bank_account?.trim() ?? '';
  const nrRb = rawAccount.replace(/^PL/i, '').replace(/\s/g, '');
  const bankLine = nrRb
    ? `\n      <RachunekBankowy>\n        <NrRB>${esc(nrRb)}</NrRB>\n      </RachunekBankowy>`
    : '';

  return `    <Platnosc>${dueDateLine}
      <FormaPlatnosci>${methodCode}</FormaPlatnosci>${bankLine}
    </Platnosc>`;
}

// ─── Document-type-specific builders ──────────────────────────────────────────

/**
 * Build the FakturaKorygowana element for correction invoices.
 * FA(3) places this inside <Fa> after <RodzajFaktury>.
 */
function buildFakturaKorygowana(inv: IssuedInvoiceWithItems): string {
  if (!inv.corrected_invoice_number) return '';
  const origDate = inv.corrected_invoice_date ?? inv.issue_date;
  return `\n    <FakturaKorygowana>
      <P_2K>${esc(inv.corrected_invoice_number)}</P_2K>
      <P_1K>${esc(isoDate(origDate))}</P_1K>
    </FakturaKorygowana>`;
}

/**
 * Build the Zalacznik elements referencing advance invoices for settlement invoices.
 * In FA(3), advance references appear in the Rozliczenie section.
 */
function buildAdvanceReferences(inv: IssuedInvoiceWithItems): string {
  if (!inv.linked_advances || inv.linked_advances.length === 0) return '';
  return inv.linked_advances.map(adv => {
    return `\n      <ZalacznikTyp>\n        <P_7>${esc(adv.advance_number ?? '')}</P_7>\n      </ZalacznikTyp>`;
  }).join('');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Raw FA(3) XML for a single issued invoice. No signing applied. */
export function buildFa2Xml(invoice: IssuedInvoiceWithItems): string {
  const vatGroups = buildVatGroups(invoice.items);

  const naglowek  = buildNaglowek();
  const podmiot1  = buildPodmiot1(invoice);
  const podmiot2  = buildPodmiot2(invoice);
  const vatSum    = buildVatSummaryAndP15(invoice, vatGroups);
  const adnotacje = buildAdnotacje(invoice, vatGroups);
  const faWiersze = buildFaWiersze(invoice);
  const platnosc  = buildPlatnosc(invoice);

  const p6 = invoice.sale_date && invoice.sale_date !== invoice.issue_date
    ? `\n    <P_6>${esc(isoDate(invoice.sale_date))}</P_6>`
    : '';

  const docType = (invoice.document_type ?? 'STANDARD') as DocumentType;
  const rodzaj = KSEF_RODZAJ_FAKTURY[docType] ?? 'VAT';

  // Correction invoice: add FakturaKorygowana after RodzajFaktury
  const korygowana = docType === 'CORRECTION' ? buildFakturaKorygowana(invoice) : '';

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
    <RodzajFaktury>${rodzaj}</RodzajFaktury>${korygowana}
${faWiersze}
${platnosc}
  </Fa>
</Faktura>`;
}
