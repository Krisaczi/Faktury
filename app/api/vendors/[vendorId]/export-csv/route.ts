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
    row.seller_nip,
    row.bank_account,
    row.flag_count,
    row.open_flag_count,
  ].map(escapeCell).join(',');
}

const CSV_HEADER = [
  'Invoice Number',
  'Issue Date',
  'Due Date',
  'Amount',
  'Currency',
  'Risk Level',
  'Seller NIP',
  'Bank Account',
  'Flag Count',
  'Open Flags',
].join(',');

export async function POST(
  req: NextRequest,
  { params }: { params: { vendorId: string } }
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { from, to, riskLevel, search } = body as {
      from?: string;
      to?: string;
      riskLevel?: string;
      search?: string;
    };

    const { data, error } = await supabase.rpc('get_vendor_invoices_page', {
      p_vendor_id:  params.vendorId,
      p_from:       from  ?? null,
      p_to:         to    ?? null,
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

    // Verify vendor belongs to company
    const { data: vendor } = await supabase
      .from('vendors')
      .select('id, name')
      .eq('id', params.vendorId)
      .maybeSingle();

    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    const csv = [CSV_HEADER, ...rows.map(rowToCsv)].join('\n');

    await supabase.from('audit_logs').insert({
      company_id: userRecord.company_id,
      user_id:    user.id,
      action:     'vendor_export_csv',
      metadata:   { vendor_id: params.vendorId, row_count: rows.length, from, to, riskLevel, search },
    });

    const vendorSlug = (vendor.name ?? params.vendorId).toLowerCase().replace(/\s+/g, '-');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="vendor-${vendorSlug}-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[api/vendors/[vendorId]/export-csv]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
