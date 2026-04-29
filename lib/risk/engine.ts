'use server';

import { createClient } from '@/lib/supabase/server';
import { getInvoiceMetadata } from '@/lib/ksef/parser';

type Severity = 'low' | 'medium' | 'high';
type OverallRisk = 'low' | 'medium' | 'high';

interface RiskFlag {
  type: string;
  severity: Severity;
  message: string;
}

export interface RiskEngineResult {
  overallRisk: OverallRisk;
  flagsCreated: number;
  flags: RiskFlag[];
}

interface InvoiceRow {
  id: string;
  company_id: string;
  vendor_id: string | null;
  invoice_number: string;
  amount: number;
  bank_account: string;
  issue_date: string | null;
  due_date: string | null;
  xml_raw: string;
  ksef_reference: string;
  seller_nip: string;
  buyer_nip: string;
}

interface VendorRow {
  id: string;
  company_id: string;
  nip: string;
  bank_accounts: string[];
  avg_amount: number;
}

function normalizeIban(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

function deriveOverallRisk(flags: RiskFlag[]): OverallRisk {
  if (flags.some((f) => f.severity === 'high')) return 'high';
  if (flags.some((f) => f.severity === 'medium')) return 'medium';
  return 'low';
}

async function fetchInvoice(
  supabase: ReturnType<typeof createClient>,
  invoiceId: string
): Promise<InvoiceRow> {
  const { data, error } = await supabase
    .from('company_invoices')
    .select(
      'id, company_id, vendor_id, invoice_number, amount, bank_account, issue_date, due_date, xml_raw, ksef_reference, seller_nip, buyer_nip'
    )
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch invoice: ${error.message}`);
  if (!data) throw new Error(`Invoice not found: ${invoiceId}`);
  return data as InvoiceRow;
}

async function fetchVendor(
  supabase: ReturnType<typeof createClient>,
  vendorId: string
): Promise<VendorRow | null> {
  const { data, error } = await supabase
    .from('company_vendors')
    .select('id, company_id, nip, bank_accounts, avg_amount')
    .eq('id', vendorId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch vendor: ${error.message}`);
  return data as VendorRow | null;
}

async function checkDuplicateInvoice(
  supabase: ReturnType<typeof createClient>,
  invoice: InvoiceRow
): Promise<RiskFlag | null> {
  const { data, error } = await supabase
    .from('company_invoices')
    .select('id')
    .eq('company_id', invoice.company_id)
    .eq('invoice_number', invoice.invoice_number)
    .eq('amount', invoice.amount)
    .neq('id', invoice.id);

  if (error) return null;

  const matches = data as { id: string }[] | null;

  if (matches && matches.length > 0) {
    const vendorMatches = invoice.vendor_id
      ? await supabase
          .from('company_invoices')
          .select('id')
          .eq('company_id', invoice.company_id)
          .eq('invoice_number', invoice.invoice_number)
          .eq('amount', invoice.amount)
          .eq('vendor_id', invoice.vendor_id)
          .neq('id', invoice.id)
      : { data: matches };

    const dupes = vendorMatches.data as { id: string }[] | null;
    if (dupes && dupes.length > 0) {
      return {
        type: 'DUPLICATE_INVOICE',
        severity: 'high',
        message: `Duplicate invoice detected: same invoice number "${invoice.invoice_number}", vendor, and amount (${invoice.amount}) already exists.`,
      };
    }
  }

  return null;
}

function checkBankAccountMismatch(
  invoice: InvoiceRow,
  vendor: VendorRow | null
): RiskFlag | null {
  const invoiceAccount = invoice.bank_account?.trim();
  if (!invoiceAccount) return null;
  if (!vendor) return null;

  const knownAccounts = (vendor.bank_accounts ?? []).map(normalizeIban);
  if (knownAccounts.length === 0) return null;

  const normalizedInvoice = normalizeIban(invoiceAccount);
  if (!knownAccounts.includes(normalizedInvoice)) {
    return {
      type: 'BANK_ACCOUNT_MISMATCH',
      severity: 'high',
      message: `Bank account on invoice (${invoiceAccount}) does not match any known account for this vendor.`,
    };
  }

  return null;
}

function checkAmountOutlier(
  invoice: InvoiceRow,
  vendor: VendorRow | null
): RiskFlag | null {
  if (!vendor) return null;
  const avg = vendor.avg_amount;
  if (!avg || avg <= 0) return null;

  if (invoice.amount > avg * 2) {
    return {
      type: 'AMOUNT_OUTLIER',
      severity: 'medium',
      message: `Invoice amount (${invoice.amount}) is more than 2x the vendor's average invoice amount (${avg.toFixed(2)}).`,
    };
  }

  return null;
}

async function checkNewVendor(
  supabase: ReturnType<typeof createClient>,
  invoice: InvoiceRow,
  vendor: VendorRow | null
): Promise<RiskFlag | null> {
  if (!vendor) return null;

  const { data, error } = await supabase
    .from('company_invoices')
    .select('id')
    .eq('company_id', invoice.company_id)
    .eq('vendor_id', vendor.id)
    .neq('id', invoice.id)
    .limit(1);

  if (error) return null;

  const history = data as { id: string }[] | null;
  if (!history || history.length === 0) {
    return {
      type: 'NEW_VENDOR',
      severity: 'medium',
      message: `This is the first invoice from vendor "${vendor.nip}". No prior transaction history available.`,
    };
  }

  return null;
}

function checkMissingFields(
  invoice: InvoiceRow,
  xmlMeta: ReturnType<typeof getInvoiceMetadata> | null
): RiskFlag[] {
  const flags: RiskFlag[] = [];

  if (!invoice.due_date?.trim()) {
    flags.push({
      type: 'MISSING_DUE_DATE',
      severity: 'low',
      message: 'Invoice is missing a due date.',
    });
  }

  if (!invoice.bank_account?.trim()) {
    flags.push({
      type: 'MISSING_BANK_ACCOUNT',
      severity: 'low',
      message: 'Invoice does not specify a bank account for payment.',
    });
  }

  if (xmlMeta) {
    const { totalGross, totalNet, totalVat } = xmlMeta;
    if (totalNet > 0 && totalVat > 0) {
      const computed = parseFloat((totalNet + totalVat).toFixed(2));
      const stored = parseFloat(totalGross.toFixed(2));
      if (Math.abs(computed - stored) > 0.02) {
        flags.push({
          type: 'MISMATCHED_TOTALS',
          severity: 'medium',
          message: `Invoice totals are inconsistent: net (${totalNet}) + VAT (${totalVat}) = ${computed}, but gross total is ${stored}.`,
        });
      }
    }
  }

  return flags;
}

async function persistFlags(
  supabase: ReturnType<typeof createClient>,
  invoiceId: string,
  flags: RiskFlag[]
): Promise<void> {
  if (flags.length === 0) return;

  const rows = flags.map((f) => ({
    invoice_id: invoiceId,
    type: f.type,
    severity: f.severity,
    message: f.message,
  }));

  const { error } = await supabase.from('risk_flags').insert(rows);
  if (error) throw new Error(`Failed to persist risk flags: ${error.message}`);
}

async function updateInvoiceRisk(
  supabase: ReturnType<typeof createClient>,
  invoiceId: string,
  overallRisk: OverallRisk
): Promise<void> {
  const { error } = await supabase
    .from('company_invoices')
    .update({ overall_risk: overallRisk, updated_at: new Date().toISOString() })
    .eq('id', invoiceId);

  if (error) throw new Error(`Failed to update invoice overall_risk: ${error.message}`);
}

export async function runRiskEngine(invoiceId: string): Promise<RiskEngineResult> {
  if (!invoiceId?.trim()) throw new Error('invoiceId is required');

  const supabase = createClient();

  const invoice = await fetchInvoice(supabase, invoiceId);

  const vendor = invoice.vendor_id
    ? await fetchVendor(supabase, invoice.vendor_id)
    : null;

  let xmlMeta: ReturnType<typeof getInvoiceMetadata> | null = null;
  if (invoice.xml_raw?.trim()) {
    try {
      xmlMeta = getInvoiceMetadata(invoice.xml_raw);
    } catch {
      // non-fatal — continue without XML-derived checks
    }
  }

  await supabase
    .from('risk_flags')
    .delete()
    .eq('invoice_id', invoiceId);

  const flagResults = await Promise.all([
    checkDuplicateInvoice(supabase, invoice),
    Promise.resolve(checkBankAccountMismatch(invoice, vendor)),
    Promise.resolve(checkAmountOutlier(invoice, vendor)),
    checkNewVendor(supabase, invoice, vendor),
  ]);

  const fieldFlags = checkMissingFields(invoice, xmlMeta);

  const flags: RiskFlag[] = [
    ...flagResults.filter((f): f is RiskFlag => f !== null),
    ...fieldFlags,
  ];

  const overallRisk = deriveOverallRisk(flags);

  await persistFlags(supabase, invoiceId, flags);
  await updateInvoiceRisk(supabase, invoiceId, overallRisk);

  return {
    overallRisk,
    flagsCreated: flags.length,
    flags,
  };
}
