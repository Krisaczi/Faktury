import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

function escapeCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToCsv(row: Record<string, unknown>): string {
  return [
    row.invoice_number,
    row.issue_date,
    row.due_date,
    row.amount,
    row.currency,
    row.overall_risk,
    row.vendor_name,
    row.seller_nip,
    row.bank_account,
    row.flag_count,
  ].map(escapeCell).join(',');
}

const CSV_HEADER = [
  'Invoice Number',
  'Issue Date',
  'Due Date',
  'Amount',
  'Currency',
  'Risk Level',
  'Vendor',
  'Seller NIP',
  'Bank Account',
  'Flag Count',
].join(',');

export async function POST(req: NextRequest) {
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
      return NextResponse.json({ error: 'Company not found' }, { status: 403 });
    }

    const body = await req.json();
    const { from, to, vendorId, riskLevel, search } = body as {
      from?: string;
      to?: string;
      vendorId?: string;
      riskLevel?: string;
      search?: string;
    };

    // Fetch all matching rows (up to 10 000 for safety)
    const { data, error } = await supabase.rpc('get_risk_report_page', {
      p_from:       from      ?? null,
      p_to:         to        ?? null,
      p_vendor_id:  vendorId  ?? null,
      p_risk_level: riskLevel ?? null,
      p_search:     search    ?? null,
      p_page:       1,
      p_page_size:  10000,
      p_sort_by:    'issue_date',
      p_sort_dir:   'desc',
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = Array.isArray(data) ? data[0] : data;
    const rawRows = result?.rows;
    const rows: Record<string, unknown>[] = Array.isArray(rawRows) ? rawRows as Record<string, unknown>[] : [];

    // Build CSV
    const lines = [CSV_HEADER, ...rows.map(rowToCsv)];
    const csv = lines.join('\n');

    // Record audit entry
    await supabase.from('exports_audit').insert({
      company_id:  userRecord.company_id,
      user_id:     user.id,
      export_type: 'risk_report_csv',
      filters: { from, to, vendorId, riskLevel, search } as unknown as never,
      row_count:   rows.length,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="risk-report-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[api/reports/risk/export-csv]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
