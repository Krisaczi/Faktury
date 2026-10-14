import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { runWhiteListVerification } from '@/lib/white-list/verify';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userRecord } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch invoice with white list relevant fields
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('id, company_id, vendor_id, seller_nip, bank_account, bank_account_number, invoice_date, issue_date')
      .eq('id', params.id)
      .eq('company_id', userRecord.company_id)
      .maybeSingle();

    if (invError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const bankAccount = invoice.bank_account_number ?? invoice.bank_account ?? null;

    if (!invoice.seller_nip || !bankAccount) {
      return NextResponse.json(
        { error: 'Missing seller NIP or bank account number for White List verification' },
        { status: 422 }
      );
    }

    const result = await runWhiteListVerification(
      supabase,
      invoice.id,
      invoice.company_id,
      invoice.vendor_id,
      invoice.seller_nip,
      bankAccount,
      // Manual rechecks must use the current VAT register. The invoice date can
      // be historical and may return NOT_FOUND even when the vendor is listed today.
      null,
      user.id
    );

    return NextResponse.json({
      status: result.status,
      companyName: result.companyName,
      taxId: result.taxId,
      bankAccount: result.bankAccount,
      message: result.message,
    });
  } catch (err) {
    console.error('[api/invoices/[id]/white-list-check]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
