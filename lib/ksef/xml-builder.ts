/**
 * KSeF FA(3) XML builder.
 *
 * Maps our internal IssuedInvoiceWithItems structure to the FA(3) logical XML
 * schema published by the Polish Ministry of Finance (Ministerstwo Finansów).
 *
 * Schema reference: FA(3) — http://crd.gov.pl/wzor/2025/06/25/13775/
 *
 * This builder is schema-driven: element ordering comes from fa3-schema.ts,
 * and the VAT summary (P_13/P_14/P_15) is computed dynamically by the
 * vat-summary-engine. No P_13 fields are hardcoded — every field is derived
 * from the line items.
 */

import type { IssuedInvoiceWithItems } from '@/types/issued-invoice';
import type { VatRate, DocumentType } from '@/types/issued-invoice';
import { KSEF_RODZAJ_FAKTURY } from '@/types/issued-invoice';
import { format, parseISO } from 'date-fns';
import { P13_FIELDS, P14_FIELDS, VALID_P12_VALUES } from './fa3-schema';
import { computeVatSummary, buildVatSummaryXml, getActiveCategories } from './vat-summary-engine';

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

// ─── Payment method mapping ───────────────────────────────────────────────────

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
 * Build the Adnotacje block.
 *
 * P_18 and P_19 are derived dynamically from the active VAT categories
 * (positive net only — reversed categories don't trigger annotations).
 */
function buildAdnotacje(inv: IssuedInvoiceWithItems, summary: ReturnType<typeof computeVatSummary>): string {
  const activeCats = getActiveCategories(summary.groups);

  // P_18=1 (reverse charge) and P_19=1 (VAT exemption) cannot coexist
  const p18 = (activeCats.hasReverseCharge && !activeCats.hasExempt) ? '1' : '2';
  const exemptionReason = inv.notes?.trim()
    ? inv.notes.trim()
    : 'zwolnienie z podatku VAT';
  const zwolnienie = activeCats.hasExempt
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
      
    </Adnotacje>`;
}

/**
 * Build FaWiersz (line items) for FA(3).
 *
 * P_12 values are looked up from the P13_FIELDS schema definition — no
 * hardcoded rate-to-code mapping.
 */
function buildFaWiersze(inv: IssuedInvoiceWithItems): string {
  return inv.items.map((item) => {
    const rate = (item.vat_rate ?? '23') as string;
    const def = P13_FIELDS[rate] ?? P13_FIELDS['23'];
    const discountPct = typeof item.discount_pct === 'string'
      ? parseFloat(item.discount_pct)
      : item.discount_pct;
    const discountLine = discountPct && discountPct > 0
      ? `\n      <P_10>${dec2(discountPct)}</P_10>`
      : '';

    // P_9A must be non-negative per FA(3) XSD
    const p9a = Math.abs(item.unit_price_net);

    return `    <FaWiersz>
      <NrWierszaFa>${item.position}</NrWierszaFa>
      <P_7>${esc(item.name)}</P_7>
      <P_8A>${esc(item.unit)}</P_8A>
      <P_8B>${dec2(Math.abs(item.quantity))}</P_8B>
      <P_9A>${dec2(p9a)}</P_9A>${discountLine}
      <P_11>${dec2(item.net_amount)}</P_11>
      <P_12>${esc(def.p12Value)}</P_12>
    </FaWiersz>`;
  }).join('\n');
}

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

function buildRozliczenie(inv: IssuedInvoiceWithItems, computedP15: number): string {
  // Use computed P_15 from the VAT summary engine for consistency
  const grossTotal = Math.abs(computedP15);
  if (computedP15 >= 0) {
    return `    <Rozliczenie>
      <DoZaplaty>${dec2(grossTotal)}</DoZaplaty>
    </Rozliczenie>`;
  }
  return `    <Rozliczenie>
      <DoRozliczenia>${dec2(grossTotal)}</DoRozliczenia>
    </Rozliczenie>`;
}

/**
 * Build optional special-procedure sections: NoweSrodkiTransportu and PMarzy.
 *
 * These are ONLY emitted when the invoice explicitly flags them via
 * `specialProcedure.newMeansOfTransport` or `specialProcedure.marginScheme`.
 * Standard service invoices must never contain these sections.
 *
 * Returns an object with the XML fragments and a diagnostic log of which
 * sections were generated vs. skipped.
 */
interface OptionalSectionResult {
  xml: string;
  generated: string[];
  skipped: string[];
}

function buildOptionalSections(inv: IssuedInvoiceWithItems): OptionalSectionResult {
  const flags = inv.specialProcedure;
  const newTransport = flags?.newMeansOfTransport === true;
  const marginScheme = flags?.marginScheme === true;

  const generated: string[] = [];
  const skipped: string[] = [];
  const parts: string[] = [];

  if (newTransport) {
    parts.push(`    <NoweSrodkiTransportu>
      <P_22N>1</P_22N>
    </NoweSrodkiTransportu>`);
    generated.push('NoweSrodkiTransportu');
  } else {
    skipped.push('NoweSrodkiTransportu');
  }

  if (marginScheme) {
    parts.push(`    <PMarzy>
      <P_PMarzyN>1</P_PMarzyN>
    </PMarzy>`);
    generated.push('PMarzy');
  } else {
    skipped.push('PMarzy');
  }

  return {
    xml: parts.length > 0 ? parts.join('\n') : '',
    generated,
    skipped,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Raw FA(3) XML for a single issued invoice. No signing applied. */
export function buildFa2Xml(invoice: IssuedInvoiceWithItems): string {
  const summary = computeVatSummary(invoice.items);

  const naglowek  = buildNaglowek();
  const podmiot1  = buildPodmiot1(invoice);
  const podmiot2  = buildPodmiot2(invoice);
  const vatSum    = buildVatSummaryXml(summary).join('\n');
  const adnotacje = buildAdnotacje(invoice, summary);
  const faWiersze = buildFaWiersze(invoice);
  const rozliczenie = buildRozliczenie(invoice, summary.p15);
  const platnosc  = buildPlatnosc(invoice);
  const optionalSections = buildOptionalSections(invoice);

  const p6 = invoice.sale_date && invoice.sale_date !== invoice.issue_date
    ? `\n    <P_6>${esc(isoDate(invoice.sale_date))}</P_6>`
    : '';

  const docType = (invoice.document_type ?? 'STANDARD') as DocumentType;
  const rodzaj = KSEF_RODZAJ_FAKTURY[docType] ?? 'VAT';

  const korygowana = docType === 'CORRECTION' ? buildCorrectionElements(invoice) : '';

  const optionalXml = optionalSections.xml ? `\n${optionalSections.xml}` : '';

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
${rozliczenie}${optionalXml}
${platnosc}
  </Fa>
</Faktura>`;
}

/**
 * Get the list of optional sections that were generated vs. skipped for an invoice.
 * Useful for diagnostics before XML generation.
 */
export function getOptionalSectionsStatus(inv: IssuedInvoiceWithItems): {
  generated: string[];
  skipped: string[];
} {
  return buildOptionalSections(inv);
}
