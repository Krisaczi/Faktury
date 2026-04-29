import type { KSeFInvoiceMetadata, KSeFLineItem } from './types';
import { KSeFError } from './errors';

function extractTag(xml: string, tag: string): string {
  const pattern = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\/(?:[^:>]+:)?${tag}>`, 'i');
  const match = xml.match(pattern);
  return match?.[1]?.trim() ?? '';
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const pattern = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*\\s${attr}="([^"]*)"`, 'i');
  return xml.match(pattern)?.[1]?.trim() ?? '';
}

function extractAllTags(xml: string, tag: string): string[] {
  const results: string[] = [];
  const pattern = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\/(?:[^:>]+:)?${tag}>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function safeFloat(s: string): number {
  const n = parseFloat(s.replace(',', '.').replace(/\s/g, ''));
  return isNaN(n) ? 0 : n;
}

function extractSchemaVersion(xml: string): string {
  const match = xml.match(/KodFormularza[^>]*kodSystemowy="([^"]+)"/i);
  return match?.[1]?.trim() ?? 'FA';
}

function extractBankAccount(xml: string): string | null {
  const nrb = extractTag(xml, 'NrRachunku');
  if (nrb) return nrb;
  const iban = extractTag(xml, 'IBAN');
  return iban || null;
}

function parseLineItems(xml: string): KSeFLineItem[] {
  const faBlock = extractTag(xml, 'Fa');
  if (!faBlock) return [];

  const rows = extractAllTags(faBlock, 'FaWiersz');

  return rows.map((row): KSeFLineItem => {
    const name =
      extractTag(row, 'P_7') ||
      extractTag(row, 'NazwaTowaru') ||
      extractTag(row, 'Opis') ||
      '';

    const qty = extractTag(row, 'P_8A') || extractTag(row, 'Ilosc') || '';
    const unitPrice = extractTag(row, 'P_9A') || extractTag(row, 'CenaJednostkowa') || '';
    const netAmount = extractTag(row, 'P_11') || extractTag(row, 'WartoscNetto') || '';
    const vatRate = extractTag(row, 'P_12') || extractTag(row, 'StawkaVat') || '';
    const vatAmount = extractTag(row, 'P_14') || extractTag(row, 'KwotaVat') || '';
    const grossAmount = extractTag(row, 'P_11A') || extractTag(row, 'WartoscBrutto') || '';

    return {
      name,
      quantity: qty ? safeFloat(qty) : null,
      unitPrice: unitPrice ? safeFloat(unitPrice) : null,
      netAmount: netAmount ? safeFloat(netAmount) : null,
      vatRate: vatRate || null,
      vatAmount: vatAmount ? safeFloat(vatAmount) : null,
      grossAmount: grossAmount ? safeFloat(grossAmount) : null,
    };
  });
}

export function getInvoiceMetadata(xml: string): KSeFInvoiceMetadata {
  if (!xml || typeof xml !== 'string') {
    throw new KSeFError('XML string is empty or not a string', 'PARSE_ERROR');
  }

  const hasFaktura =
    xml.includes('<Faktura') ||
    xml.includes(':Faktura') ||
    xml.includes('<FA') ||
    xml.includes(':FA');

  if (!hasFaktura) {
    throw new KSeFError(
      'Provided string does not appear to be a valid FA XML document',
      'PARSE_ERROR'
    );
  }

  const podmiot1 = extractTag(xml, 'Podmiot1');
  const podmiot2 = extractTag(xml, 'Podmiot2');
  const faBlock = extractTag(xml, 'Fa');

  const sellerDane = extractTag(podmiot1, 'DaneIdentyfikacyjne');
  const buyerDane = extractTag(podmiot2, 'DaneIdentyfikacyjne');

  const sellerNip =
    extractTag(sellerDane, 'NIP') || extractTag(podmiot1, 'NIP') || '';
  const sellerName =
    extractTag(sellerDane, 'PelnaNazwa') ||
    extractTag(podmiot1, 'NazwaPodmiotu') ||
    extractTag(podmiot1, 'Nazwa') ||
    '';

  const buyerNip =
    extractTag(buyerDane, 'NIP') || extractTag(podmiot2, 'NIP') || '';
  const buyerName =
    extractTag(buyerDane, 'PelnaNazwa') ||
    extractTag(podmiot2, 'NazwaPodmiotu') ||
    extractTag(podmiot2, 'Nazwa') ||
    '';

  const invoiceNumber =
    extractTag(faBlock, 'P_2') || extractTag(xml, 'NrFaktury') || '';
  const issueDate =
    extractTag(faBlock, 'P_1') || extractTag(xml, 'DataWystawienia') || '';
  const dueDate =
    extractTag(faBlock, 'P_1M') ||
    extractTag(faBlock, 'TerminPlatnosci') ||
    extractTag(xml, 'TerminPlatnosci') ||
    null;

  const currency =
    extractTag(faBlock, 'KodWaluty') || extractTag(xml, 'KodWaluty') || 'PLN';

  const totalGross = safeFloat(
    extractTag(faBlock, 'P_15') || extractTag(xml, 'WartoscBrutto') || '0'
  );
  const totalNet = safeFloat(
    extractTag(faBlock, 'P_13_1') ||
      extractTag(faBlock, 'SumaWartosciNetto') ||
      extractTag(xml, 'WartoscNetto') ||
      '0'
  );
  const totalVat = safeFloat(
    extractTag(faBlock, 'P_14_1') ||
      extractTag(faBlock, 'SumaVat') ||
      extractTag(xml, 'KwotaVat') ||
      '0'
  );

  const bankAccount = extractBankAccount(xml);
  const ksefSchemaVersion = extractSchemaVersion(xml);
  const lineItems = parseLineItems(xml);

  return {
    invoiceNumber,
    issueDate,
    dueDate: dueDate || null,
    sellerNip,
    sellerName,
    buyerNip,
    buyerName,
    totalGross,
    totalNet,
    totalVat,
    currency,
    ksefSchemaVersion,
    lineItems,
    bankAccount,
  };
}
