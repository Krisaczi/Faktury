import type { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  evaluateInvoiceRisk,
  highestSeverity,
  normalizeNip,
  type RiskFinding,
  type RiskInvoice,
  type RiskSeverity,
} from './invoice-risk-rules';

type Supabase = Awaited<ReturnType<typeof getSupabaseServerClient>>;

interface InvoiceRow {
  id: string;
  created_at: string;
  invoice_number: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  amount: number | null;
  seller_nip: string | null;
  seller_name: string | null;
  bank_account: string | null;
}

const INVOICE_COLUMNS =
  'id, created_at, invoice_number, invoice_date, total_amount, amount, seller_nip, seller_name, bank_account';

function toRiskInvoice(row: InvoiceRow): RiskInvoice {
  return {
    id: row.id,
    createdAt: row.created_at,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    totalAmount: row.total_amount ?? row.amount,
    sellerNip: row.seller_nip,
    sellerName: row.seller_name,
    bankAccount: row.bank_account,
  };
}

export interface InvoiceRiskResult {
  overallRisk: RiskSeverity | null;
  findings: RiskFinding[];
}

export async function runInvoiceRiskEngine(
  supabase: Supabase,
  companyId: string,
  invoiceId: string,
): Promise<InvoiceRiskResult> {
  const { data: row, error: rowError } = await supabase
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('id', invoiceId)
    .eq('company_id', companyId)
    .single();
  if (rowError || !row) throw new Error(`Risk engine could not load invoice: ${rowError?.message ?? 'not found'}`);

  const current = toRiskInvoice(row as InvoiceRow);
  const nip = normalizeNip(current.sellerNip);

  let history: RiskInvoice[] = [];
  if (nip) {
    const { data: rows, error: historyError } = await supabase
      .from('invoices')
      .select(INVOICE_COLUMNS)
      .eq('company_id', companyId)
      .eq('seller_nip', nip)
      .neq('id', invoiceId)
      .limit(5000);
    if (historyError) throw new Error(`Risk engine could not load history: ${historyError.message}`);
    history = (rows as InvoiceRow[] ?? []).map(toRiskInvoice);
  }

  const { findings, nipValid } = evaluateInvoiceRisk(current, history);

  const { error: deleteError } = await supabase
    .from('invoice_risk_findings')
    .delete()
    .eq('invoice_id', invoiceId);
  if (deleteError) throw new Error(`Risk engine could not clear previous findings: ${deleteError.message}`);

  if (findings.length > 0) {
    const { error: insertError } = await supabase.from('invoice_risk_findings').insert(
      findings.map((f) => ({
        invoice_id: invoiceId,
        company_id: companyId,
        rule_code: f.ruleCode,
        rule_name: f.ruleName,
        severity: f.severity,
        score: f.score,
        message: f.message,
        details: f.details as never,
      })),
    );
    if (insertError) throw new Error(`Risk engine could not save findings: ${insertError.message}`);
  }

  const { data: openFlags } = await supabase
    .from('risk_flags')
    .select('severity')
    .eq('invoice_id', invoiceId)
    .eq('status', 'open');

  const severities = [
    ...findings.map((f) => f.severity),
    ...(openFlags ?? [])
      .map((f) => f.severity)
      .filter((s): s is RiskSeverity => s === 'low' || s === 'medium' || s === 'high' || s === 'critical'),
  ];
  const overallRisk = highestSeverity(severities);

  const { error: updateError } = await supabase
    .from('invoices')
    .update({ overall_risk: overallRisk })
    .eq('id', invoiceId);
  if (updateError) throw new Error(`Risk engine could not update invoice risk: ${updateError.message}`);

  const check = (failed: boolean) => (failed ? 'FAIL' : 'PASS');
  const hasRule = (code: string) => findings.some((f) => f.ruleCode === code);
  console.info('InvoiceRiskEngine Start', {
    invoiceId,
    'Parsed NIP': current.sellerNip ?? null,
    'Parsed Invoice Number': current.invoiceNumber ?? null,
    'Parsed Date': current.invoiceDate ?? null,
    'Parsed Amount': current.totalAmount ?? null,
    'Historical invoices compared': history.length,
    'Duplicate Check': check(hasRule('duplicate_invoice')),
    'NIP Validation': nipValid ? 'PASS' : 'FAIL',
    'IBAN Change Check': check(hasRule('supplier_bank_account_changed')),
    'Risk Findings Count': findings.length,
    'Overall Risk': overallRisk ?? 'none',
  });

  return { overallRisk, findings };
}
