import { validateBillingAddress, type BillingAddress } from '@/lib/invoice-address';

export type InvoiceValidationIssue = { field: string; label: string };

export type InvoiceForValidation = {
  invoice_number: string | null;
  numbering_mode: string | null;
  document_type: string | null;
  issue_date: string | null;
  seller_name: string | null;
  seller_nip: string | null;
  billing_address_snapshot: BillingAddress | null;
  buyer_name: string | null;
  buyer_address: string | null;
  payment_method: string | null;
  seller_bank_account: string | null;
  company_bank_account_id: string | null;
  corrected_invoice_number: string | null;
  correction_reason: string | null;
};

export type ItemForValidation = {
  name: string | null;
  quantity: number | null;
  unit_price_net: number | null;
  vat_rate: string | null;
};

export function findSubmissionIssues(
  invoice: InvoiceForValidation,
  items: ItemForValidation[],
): InvoiceValidationIssue[] {
  const issues: InvoiceValidationIssue[] = [];
  const add = (field: string, label: string) => issues.push({ field, label });
  const isCorrection = invoice.document_type === 'CORRECTION';
  const isPlaceholderNumber = !invoice.invoice_number || invoice.invoice_number.startsWith('SZKIC-');

  if (invoice.numbering_mode === 'manual' && isPlaceholderNumber) add('invoice_number', 'Numer faktury');
  if (!invoice.issue_date) add('issue_date', 'Data wystawienia');
  if (!invoice.seller_name?.trim()) add('seller_name', 'Nazwa sprzedawcy');
  if (!invoice.seller_nip?.trim()) add('seller_nip', 'NIP sprzedawcy');

  if (!invoice.billing_address_snapshot) {
    add('seller_address', 'Adres sprzedawcy');
  } else {
    const { valid, missingFields } = validateBillingAddress(invoice.billing_address_snapshot);
    if (!valid) add('seller_address', `Adres sprzedawcy (brakuje: ${missingFields.join(', ')})`);
  }

  if (!invoice.buyer_name?.trim()) add('buyer_name', 'Nazwa nabywcy');
  if (!invoice.buyer_address?.trim()) add('buyer_address', 'Adres nabywcy');
  if (!invoice.payment_method) add('payment_method', 'Forma płatności');
  if (invoice.payment_method === 'transfer' && !invoice.seller_bank_account && !invoice.company_bank_account_id) {
    add('bank_account', 'Rachunek bankowy do przelewu');
  }

  if (items.length === 0) add('items', 'Co najmniej jedna pozycja');
  items.forEach((item, i) => {
    const n = i + 1;
    if (!item.name?.trim()) add(`items.${i}.name`, `Pozycja ${n}: nazwa`);
    if (!isCorrection && !(item.quantity && item.quantity > 0)) add(`items.${i}.quantity`, `Pozycja ${n}: ilość`);
    if (item.unit_price_net === null || item.unit_price_net === undefined) add(`items.${i}.unit_price_net`, `Pozycja ${n}: cena netto`);
    if (!item.vat_rate) add(`items.${i}.vat_rate`, `Pozycja ${n}: stawka VAT`);
  });

  if (isCorrection) {
    if (!invoice.corrected_invoice_number?.trim()) add('corrected_invoice_number', 'Numer faktury korygowanej');
    if (!invoice.correction_reason?.trim()) add('correction_reason', 'Powód korekty');
  }

  return issues;
}
