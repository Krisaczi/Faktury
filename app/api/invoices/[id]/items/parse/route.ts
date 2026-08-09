import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { parseInvoiceItems } from '@/lib/parsers/invoice-item-parser';

function resolveStoragePath(rawFileUrl: string): string {
  if (rawFileUrl.includes('/object/sign/')) {
    return decodeURIComponent(
      rawFileUrl.split('/object/sign/invoices/')[1]?.split('?')[0] ?? ''
    );
  }
  return rawFileUrl.replace(/^.*invoices\//, '');
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userRecord } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['owner', 'accountant'].includes(userRecord.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden: insufficient role' }, { status: 403 });
    }

    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, company_id, raw_file_url, file_url')
      .eq('id', params.id)
      .eq('company_id', userRecord.company_id)
      .maybeSingle();

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const filePath = invoice.raw_file_url ?? invoice.file_url;
    if (!filePath) {
      return NextResponse.json({ error: 'No file available to parse' }, { status: 400 });
    }

    const storagePath = resolveStoragePath(filePath);
    const { data: urlData } = await supabase.storage
      .from('invoices')
      .createSignedUrl(storagePath, 120);

    if (!urlData?.signedUrl) {
      return NextResponse.json({ error: 'Failed to create file URL' }, { status: 500 });
    }

    const fileRes = await fetch(urlData.signedUrl);
    if (!fileRes.ok) {
      return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
    }

    const contentType = fileRes.headers.get('content-type') ?? 'application/octet-stream';
    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

    const parseResult = await parseInvoiceItems(params.id, fileBuffer, contentType);

    if (parseResult.items.length === 0) {
      return NextResponse.json({
        items: [],
        source: parseResult.source,
        averageConfidence: 0,
        errors: parseResult.errors,
        message: 'No line items detected. You can add them manually.',
      });
    }

    await supabase.from('invoice_items')
      .delete()
      .eq('invoice_id', params.id);

    const rows = parseResult.items.map((item, idx) => ({
      invoice_id: params.id,
      position: idx + 1,
      description: item.description,
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      unit_price: item.unitPrice ?? null,
      net_amount: item.netAmount ?? null,
      vat_rate: item.vatRate ?? null,
      vat_amount: item.vatAmount ?? null,
      gross_amount: item.grossAmount ?? null,
      raw_text: item.rawText ?? null,
      source: item.source,
      confidence: item.confidence,
      page_number: item.pageNumber ?? null,
      bbox: item.bbox ?? null,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('invoice_items')
      .insert(rows)
      .select('id, position, description, quantity, unit, unit_price, net_amount, vat_rate, vat_amount, gross_amount, raw_text, source, confidence, page_number, bbox, confirmed, confirmed_by, confirmed_at, created_at, updated_at');

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    await supabase.from('audit_logs').insert({
      company_id: userRecord.company_id,
      user_id: user.id,
      invoice_id: params.id,
      action: 'invoice_items_parsed',
      metadata: {
        source: parseResult.source,
        count: parseResult.items.length,
        averageConfidence: parseResult.averageConfidence,
      } as unknown as never,
    });

    return NextResponse.json({
      items: inserted ?? [],
      source: parseResult.source,
      averageConfidence: parseResult.averageConfidence,
      errors: parseResult.errors,
    });
  } catch (err) {
    console.error('[api/invoices/[id]/items/parse]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
