import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { runInvoiceRiskEngine } from '@/lib/risk/run-invoice-risk';
import { parseWhiteListStatus, type BankAccountDecision } from '@/lib/risk/bank-account-review';

const DECISIONS: BankAccountDecision[] = ['account_added', 'kept_for_invoice'];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as
      | { action?: unknown; confirmNotVerified?: unknown }
      | null;
    const action = body?.action as BankAccountDecision;
    if (!DECISIONS.includes(action)) {
      return NextResponse.json({ error: 'Invalid decision' }, { status: 422 });
    }
    const confirmNotVerified = body?.confirmNotVerified === true;

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, company_id')
      .eq('id', params.id)
      .maybeSingle();
    if (invoiceError) {
      return NextResponse.json({ error: invoiceError.message }, { status: 500 });
    }
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const { data: finding, error: findingError } = await supabase
      .from('invoice_risk_findings')
      .select('details')
      .eq('invoice_id', params.id)
      .eq('rule_code', 'supplier_bank_account_changed')
      .maybeSingle();
    if (findingError) {
      return NextResponse.json({ error: findingError.message }, { status: 500 });
    }
    if (!finding) {
      return NextResponse.json({ error: 'No bank account review is pending for this invoice.' }, { status: 404 });
    }

    const whiteListStatus = parseWhiteListStatus(finding.details);
    if (action === 'account_added' && whiteListStatus !== 'VALID' && !confirmNotVerified) {
      return NextResponse.json(
        {
          error: 'This account is not verified on the White List. Confirm to add it anyway.',
          requiresConfirmation: true,
          whiteListStatus,
        },
        { status: 409 }
      );
    }

    const { data: decision, error: decisionError } = await supabase.rpc(
      'record_vendor_bank_account_decision',
      {
        p_invoice_id: params.id,
        p_action: action,
        p_white_list_status: whiteListStatus,
      }
    );
    if (decisionError || !decision) {
      console.error('[bank-account-decision] record failed:', decisionError?.message);
      return NextResponse.json({ error: 'Could not save the decision.' }, { status: 500 });
    }

    console.info('VendorBankAccountDecision', {
      invoiceId: params.id,
      'Vendor ID': decision.vendor_id,
      'User Decision': action,
      'White List Result': whiteListStatus,
      'Vendor Updated': decision.vendor_updated ? 'YES' : 'NO',
    });

    await runInvoiceRiskEngine(supabase, invoice.company_id, invoice.id);

    return NextResponse.json({ vendorUpdated: decision.vendor_updated });
  } catch (err) {
    console.error('[api/invoices/[id]/bank-account-decision POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
