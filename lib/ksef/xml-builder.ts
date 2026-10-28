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
 *   [P_13_7], [P_13_8], P_13_9, [P_13_10], [P_13_11],
 *   P_15, [KursWalutyZ], Adnotacje, RodzajFaktury,
 *   [PrzyczynaKorekty], [TypKorekty], [DaneFaKorygowanej*], ... [KursWalutyZK],
 *   [ZaliczkaCzesciowa*], [FakturaZaliczkowa*], [DodatkowyOpis],
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
 * P_13 element mapping per VAT rate:
 *   1 = 23%      (P_13_1 / P_14_1)
 *   2 = 8%       (P_13_2 / P_14_2)
 *   3 = 5%       (P_13_3 / P_14_3)
 *   4 = taxi flat (P_13_4 / P_14_4) — not used
 *   5 = 0%       (P_13_5 / P_14_5)
 *   6_1 = 0% excluding WDT/export (P_13_6_1) — not used
 *   7 = "zw"     (P_13_7)    — VAT exempt (zwolnione od podatku)
 *   8 = "np I"/"np II" (P_13_8)  — non-taxable (nie podlega)
 *   9 = total net (P_13_9)  — sum of all P_13_* fields
 *   10 = "oo"    (P_13_10)  — domestic reverse charge (odwrotne obciążenie)
 *   11 = art.119 / art.120 (P_13_11) — not used
 */
interface VatRateMapping {
  p12:           string;
  p13Element:    string;
  p14Element:    string | null;
  hasVat:        boolean;
  order:         number;
}

const VAT_RATE_MAP: Record<VatRate, VatRateMapping> = {
  '23':    { p12: '23',    p13Element: 'P_13_1',   p14Element: 'P_14_1', hasVat: true,  order: 1 },
  '8':     { p12: '8',     p13Element: 'P_13_2',   p14Element: 'P_14_2', hasVat: true,  order: 2 },
  '5':     { p12: '5',     p13Element: 'P_13_3',   p14Element: 'P_14_3', hasVat: true,  order: 3 },
  '0':     { p12: '0',     p13Element: 'P_13_5',   p14Element: null,     hasVat: false, order: 5 },
  '0_kr':  { p12: '0 KR',  p13Element: 'P_13_6_1', p14Element: null,     hasVat: false, order: 6 },
  '0_wdt': { p12: '0 WDT', p13Element: 'P_13_6_2', p14Element: null,     hasVat: false, order: 6 },
  '0_ex':  { p12: '0 EX',  p13Element: 'P_13_6_3', p14Element: null,     hasVat: false, order: 6 },
  'zw':    { p12: 'zw',    p13Element: 'P_13_7',   p14Element: null,     hasVat: false, order: 7 },
  'np':    { p12: 'np I',  p13Element: 'P_13_8',   p14Element: null,     hasVat: false, order: 8 },
  'np_ii': { p12: 'np II', p13Element: 'P_13_8',   p14Element: null,     hasVat: false, order: 8 },
  'oo':    { p12: 'oo',    p13Element: 'P_13_10',  p14Element: null,     hasVat: false, order: 10 },
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

/**
 * Rates that share the same P_13 element (e.g. np and np_ii both map to P_13_8).
 * When building groups, these rates are aggregated into a single group so that
 * their net totals are combined in the summary.
 */
const P13_AGGREGATE: Record<string, VatRate> = {
  'np_ii': 'np',
};

function buildVatGroups(items: IssuedInvoiceWithItems['items']): VatGroup[] {
  const map = new Map<VatRate, VatGroup>();
  for (const item of items) {
    const rawRate   = item.vat_rate as VatRate;
    const groupRate = P13_AGGREGATE[rawRate] ?? rawRate;
    const mapping   = VAT_RATE_MAP[rawRate] ?? VAT_RATE_MAP['23'];
    const g = map.get(groupRate);
    if (g) {
      g.netTotal   += item.net_amount;
      g.vatTotal   += item.vat_amount;
      g.grossTotal += item.gross_amount;
    } else {
      map.set(groupRate, { rate: groupRate, mapping, netTotal: item.net_amount, vatTotal: item.vat_amount, grossTotal: item.gross_amount });
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
 * XSD element order within <Fa> after P_2/[P_6]:
 *   [P_13_1, P_14_1]   23% sequence
 *   [P_13_2, P_14_2]   8% sequence
 *   [P_13_3, P_14_3]   5% sequence
 *   [P_13_5, P_14_5]   0% sequence
 *   [P_13_7]           VAT exempt (zw)
 *   [P_13_8]           non-taxable (np)
 *   P_13_9             total net — SUM of all P_13_* above (required)
 *   [P_13_10]          reverse charge (oo)
 *   [P_13_11]          art.119/120 (not used)
 *   P_15               total gross (required)
 *
 * Only P_13 tags for rates actually present on the invoice are emitted.
 * P_13_9 is computed as the sum of all per-rate net totals (not taken from
 * inv.net_total directly, to avoid drift).
 * P_15 uses inv.gross_total.
 */
function isZeroNet(g: VatGroup): boolean {
  return Math.round(g.netTotal * 100) / 100 === 0;
}

function buildVatSummaryAndP15(inv: IssuedInvoiceWithItems, vatGroups: VatGroup[]): string {
  // Emit P_13 fields for VAT groups with non-zero net totals.
  // In correction invoices, negative P_13 values are valid — they represent
  // the reversal of a category (e.g. P_13_10 = -1000 for an oo line being reversed).
  // Zero-net groups are skipped: a category that nets to zero (equal reversal
  // and new amount) produces no P_13 field, avoiding noise in the summary.
  const activeGroups = vatGroups.filter(g => !isZeroNet(g));
  const rateMap = new Map<VatRate, VatGroup>();
  for (const g of activeGroups) rateMap.set(g.rate, g);

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

  // P_13_6_1 = 0% excluding WDT/export (0 KR) — only if 0_kr has non-zero net
  if (rateMap.has('0_kr')) {
    lines.push(`    <P_13_6_1>${dec2(get('0_kr', 'netTotal'))}</P_13_6_1>`);
  }
  // P_13_6_2 = 0% WDT — only if 0_wdt has non-zero net
  if (rateMap.has('0_wdt')) {
    lines.push(`    <P_13_6_2>${dec2(get('0_wdt', 'netTotal'))}</P_13_6_2>`);
  }
  // P_13_6_3 = 0% export — only if 0_ex has non-zero net
  if (rateMap.has('0_ex')) {
    lines.push(`    <P_13_6_3>${dec2(get('0_ex', 'netTotal'))}</P_13_6_3>`);
  }

  // P_13_7 = VAT exempt (zwolnione od podatku) — only if zw has non-zero net
  if (rateMap.has('zw')) {
    lines.push(`    <P_13_7>${dec2(get('zw', 'netTotal'))}</P_13_7>`);
  }

  // P_13_8 = non-taxable (nie podlega) — only if np has non-zero net
  if (rateMap.has('np')) {
    lines.push(`    <P_13_8>${dec2(get('np', 'netTotal'))}</P_13_8>`);
  }

  // P_13_9 = total net — sum of all per-rate net totals (required)
  // Computed from ALL non-zero groups (including negative reversal amounts)
  // to match inv.net_total exactly.
  const computedNetTotal = activeGroups.reduce((sum, g) => sum + g.netTotal, 0);
  lines.push(`    <P_13_9>${dec2(computedNetTotal)}</P_13_9>`);

  // P_13_10 = domestic reverse charge (oo) — only if oo has non-zero net
  if (rateMap.has('oo')) {
    lines.push(`    <P_13_10>${dec2(get('oo', 'netTotal'))}</P_13_10>`);
  }

  // P_15 = total gross (required) — uses inv.gross_total
  lines.push(`    <P_15>${dec2(inv.gross_total)}</P_15>`);

  return lines.join('\n');
}

/**
 * Build the Adnotacje block.
 *
 * Element order: P_16 → P_17 → P_18 → P_18A → Zwolnienie → NoweSrodkiTransportu → P_23 → PMarzy
 *
 * P_18 values:
 *   1 = reverse charge (odwrotne obciążenie) — only when oo (reverse charge) lines present
 *   2 = not applicable
 *
 * P_18=1 must NEVER be set for VAT exempt (zw) invoices — VAT exemption (art. 113)
 * is not reverse charge. It is a different mechanism entirely.
 */
function buildAdnotacje(inv: IssuedInvoiceWithItems, vatGroups: VatGroup[]): string {
  // P_18/P_19 are based on which categories have POSITIVE net totals — i.e. the
  // categories that are actively present on the corrected invoice. A correction
  // that reverses away a category (e.g. oo → zw) produces a negative net for the
  // old category; that negative must NOT trigger reverse-charge or exemption flags.
  const positiveGroups = vatGroups.filter(g => Math.round(g.netTotal * 100) / 100 > 0);
  const hasExempt = positiveGroups.some(g => g.rate === 'zw');
  const hasReverseCharge = positiveGroups.some(g => g.rate === 'oo');

  // P_18=1 (reverse charge) and P_19=1 (VAT exemption) cannot coexist.
  const p18 = (hasReverseCharge && !hasExempt) ? '1' : '2';
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

/**
 * Build FaWiersz (line items) for FA(3).
 *
 * P_9A = unit net price. FA(3) requires P_9A to be non-negative (the XSD
 * restricts it to a positive decimal). For correction invoices with negative
 * line amounts, keep P_9A positive (the original unit price) and reflect the
 * correction direction via P_11 (net amount), which CAN be negative.
 */
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

    // P_9A must be non-negative per FA(3) XSD. For corrections where
    // unit_price_net is negative (indicating a reversal), use the absolute
    // value; the correction amount is reflected in P_11 (net amount).
    const p9a = Math.abs(item.unit_price_net);

    return `    <FaWiersz>
      <NrWierszaFa>${item.position}</NrWierszaFa>
      <P_7>${esc(item.name)}</P_7>
      <P_8A>${esc(item.unit)}</P_8A>
      <P_8B>${dec2(Math.abs(item.quantity))}</P_8B>
      <P_9A>${dec2(p9a)}</P_9A>${discountLine}
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
 * Build correction invoice elements for FA(3).
 * Per the FA(3) schema, after RodzajFaktury the correction fields appear:
 *   PrzyczynaKorekty (reason), TypKorekty (type), DaneFaKorygowanej (corrected invoice data)
 */
function buildCorrectionElements(inv: IssuedInvoiceWithItems): string {
  if (!inv.corrected_invoice_number) return '';
  const origDate = inv.corrected_invoice_date ?? inv.issue_date;
  const przyczyna = inv.correction_reason?.trim();
  const przyczynaLine = przyczyna
    ? `\n    <PrzyczynaKorekty>${esc(przyczyna)}</PrzyczynaKorekty>`
    : '';
  const ksefNo = (inv as unknown as { corrected_invoice_ksef_no?: string | null }).corrected_invoice_ksef_no?.trim();
  const ksefNoLine = ksefNo
    ? `\n      <NrKSeFN>${esc(ksefNo)}</NrKSeFN>`
    : '';
  return `${przyczynaLine}
    <DaneFaKorygowanej>
      <DataWystFaKorygowanej>${esc(isoDate(origDate))}</DataWystFaKorygowanej>
      <NrFaKorygowanej>${esc(inv.corrected_invoice_number)}</NrFaKorygowanej>${ksefNoLine}
    </DaneFaKorygowanej>`;
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

/**
 * Build the Rozliczenie block per FA(3) XSD.
 * Contains an optional choice of DoZaplaty (amount to pay) or DoRozliczenia (overpaid).
 * DoZaplaty = P_15 + charges - deductions. With no charges/deductions, it equals P_15.
 */
function buildRozliczenie(inv: IssuedInvoiceWithItems): string {
  if (inv.gross_total >= 0) {
    return `    <Rozliczenie>
      <DoZaplaty>${dec2(inv.gross_total)}</DoZaplaty>
    </Rozliczenie>`;
  }
  return `    <Rozliczenie>
      <DoRozliczenia>${dec2(Math.abs(inv.gross_total))}</DoRozliczenia>
    </Rozliczenie>`;
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
  const rozliczenie = buildRozliczenie(invoice);
  const platnosc  = buildPlatnosc(invoice);

  const p6 = invoice.sale_date && invoice.sale_date !== invoice.issue_date
    ? `\n    <P_6>${esc(isoDate(invoice.sale_date))}</P_6>`
    : '';

  const docType = (invoice.document_type ?? 'STANDARD') as DocumentType;
  const rodzaj = KSEF_RODZAJ_FAKTURY[docType] ?? 'VAT';

  // Correction invoice: add PrzyczynaKorekty + DaneFaKorygowanej after RodzajFaktury
  const korygowana = docType === 'CORRECTION' ? buildCorrectionElements(invoice) : '';

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
${rozliczenie}
${platnosc}
  </Fa>
</Faktura>`;
}
