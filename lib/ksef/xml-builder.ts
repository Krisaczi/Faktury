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
 *   Fa (KodWaluty, P_1, P_2, P_6?, P_13_*, P_14_*, P_15, RodzajFaktury,
 *       Adnotacje, FaWiersz*, [Rozliczenie], [Platnosc]),
 *   [Stopka], [Zalacznik]
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

interface VatRateMapping {
  p12: string;
  suffix: string;
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

// FA(3) FormaPlatnosci codes (per Ministerstwo Finansów FA(3) schema):
//   1 = gotówka (cash)
//   2 = karta (card)
//   3 = bon (voucher)
//   4 = czek (cheque)
//   5 = kredyt (credit)
//   6 = przelew (transfer)
//   7 = płatność mobilna (mobile/BLIK)
// Any unmapped value falls back to 6 (przelew) — never 'bon'.
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
  return Array.from(map.values());
}

// Sort suffixes numerically so P_13_1 < P_13_2 < P_13_3 < P_13_5 < P_13_6 < P_13_7 < P_13_8
function suffixOrder(s: string): number {
  return parseInt(s, 10);
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

/**
 * Build the P_13_*, P_14_*, P_15, RodzajFaktury, and Adnotacje block.
 *
 * FA(3) element order within <Fa>:
 *   KodWaluty, P_1, P_2, [P_6], P_13_1..P_13_8, P_14_1..P_14_8, P_15,
 *   RodzajFaktury, Adnotacje, FaWiersz*, [Rozliczenie], [Platnosc]
 *
 * P_13 and P_14 are grouped (all P_13 first, then all P_14), each with
 * suffixes in ascending numeric order: 1, 2, 3, 5, 6, 7, 8.
 *
 * Adnotacje: for a standard VAT invoice with no special procedures, only the
 * "does not apply" negative indicators are emitted. The Zwolnienie,
 * NoweSrodkiTransportu, and PMarzy choice blocks are only emitted when
 * applicable, using the negative form (P_19N, P_22N, P_PMarzyN) when the
 * procedure does not apply.
 */
function buildTotalsRodzajAndAdnotacje(inv: IssuedInvoiceWithItems, vatGroups: VatGroup[]): string {
  const sorted = [...vatGroups].sort((a, b) => suffixOrder(a.mapping.suffix) - suffixOrder(b.mapping.suffix));

  // P_13_* — all net totals grouped first
  const p13Lines = sorted
    .map(g => `    <P_13_${g.mapping.suffix}>${dec2(g.netTotal)}</P_13_${g.mapping.suffix}>`)
    .join('\n');

  // P_14_* — all VAT totals grouped after P_13
  // For rates with hasVat=true (23, 8, 5): emit P_14_x with the VAT amount
  // For 0% rate (suffix 5): emit P_14_5 with 0.00 (schema expects the pair)
  // For zw/np/oo: omit P_14 entirely (no VAT amount to report)
  const p14Lines = sorted
    .filter(g => g.mapping.hasVat || g.rate === '0')
    .map(g => `    <P_14_${g.mapping.suffix}>${dec2(g.vatTotal)}</P_14_${g.mapping.suffix}>`)
    .join('\n');

  const hasExempt = vatGroups.some(g => g.rate === 'zw');

  // Adnotacje: emit only the standard negative indicators for a regular VAT invoice.
  // P_16=2 (no cash register method), P_17=2 (no split payment), P_18=2 (no exemption),
  // P_18A=2 (no reverse charge). Then negative forms for Zwolnienie, NoweSrodkiTransportu, PMarzy.
  const adnotacje = `    <Adnotacje>
      <P_16>2</P_16>
      <P_17>2</P_17>
      <P_18>2</P_18>
      <P_18A>2</P_18A>
      <Zwolnienie>
        <P_19N>1</P_19N>
      </Zwolnienie>
      <NoweSrodkiTransportu>
        <P_22N>1</P_22N>
      </NoweSrodkiTransportu>
      <P_23>2</P_23>
      <PMarzy>
        <P_PMarzyN>1</P_PMarzyN>
      </PMarzy>
    </Adnotacje>`;

  return `    ${p13Lines}
${p14Lines ? p14Lines + '\n' : ''}    <P_15>${dec2(inv.gross_total)}</P_15>
    <RodzajFaktury>VAT</RodzajFaktury>
${adnotacje}`;
}

function buildRozliczenie(inv: IssuedInvoiceWithItems): string {
  const totalGross = inv.gross_total;

  return `    <Rozliczenie>
      <DoZaplaty>${dec2(totalGross)}</DoZaplaty>
      <Zaplacono>${dec2(0)}</Zaplacono>
      <Zaplaciodne>${dec2(totalGross)}</Zaplaciodne>
    </Rozliczenie>`;
}

function buildPlatnosc(inv: IssuedInvoiceWithItems): string {
  const methodCode = PAYMENT_METHOD_MAP[inv.payment_method] ?? '6';
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

  const naglowek    = buildNaglowek();
  const podmiot1    = buildPodmiot1(invoice);
  const podmiot2    = buildPodmiot2(invoice);
  const faWiersze   = buildFaWiersze(invoice);
  const totals      = buildTotalsRodzajAndAdnotacje(invoice, vatGroups);
  const rozliczenie = buildRozliczenie(invoice);
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
${totals}
${faWiersze}
${rozliczenie}
${platnosc}
  </Fa>
</Faktura>`;
}
