import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { parseXmlInvoices, type ParsedCharge } from '@/lib/parsers/xml-invoice-parser';
import { mapChargesToPdf, type ChargeMapping } from '@/lib/parsers/charge-mapper';
import { extractPdfText } from '@/lib/parsers/pdf-text-parser';

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

    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
    const contentType = fileRes.headers.get('content-type') ?? 'application/octet-stream';

    const xmlText = fileBuffer.toString('utf-8');
    const parsed = await parseXmlInvoices(xmlText);

    if (parsed.invoices.length === 0 || !parsed.invoices[0].charges?.length) {
      return NextResponse.json({
        charges: [],
        chargesTotal: null,
        amountDue: null,
        reconciliation: null,
        message: 'No Rozliczenie charges detected in the invoice file.',
      });
    }

    const inv0 = parsed.invoices[0];
    const charges: ParsedCharge[] = inv0.charges!;

    // Attempt PDF text-layer mapping if a PDF is available
    let mappings: ChargeMapping[] = charges.map(() => ({
      pageNumber: null,
      bbox: null,
      confidence: 0,
    }));

    const isPdf = contentType.includes('pdf') || fileBuffer[0] === 0x25;
    if (isPdf) {
      try {
        const pdfText = await extractPdfText(new Uint8Array(fileBuffer));
        mappings = mapChargesToPdf(charges, pdfText);
      } catch {
        // PDF text extraction can fail on scanned docs; charges still persist
      }
    }

    // Idempotent upsert: delete existing ksef-sourced charges, then re-insert.
    // Manual charges (source='manual') are preserved across reparse cycles.
    await supabase
      .from('invoice_charges')
      .delete()
      .eq('invoice_id', params.id)
      .eq('source', 'ksef');

    const rows = charges.map((c, idx) => ({
      invoice_id: params.id,
      amount: c.amount,
      reason: c.reason,
      source: 'ksef' as const,
      confidence: mappings[idx].confidence || 1.0,
      page_number: mappings[idx].pageNumber,
      bbox: mappings[idx].bbox,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('invoice_charges')
      .insert(rows)
      .select('*');

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const chargesTotal = inv0.chargesTotal ?? null;
    const amountDue = inv0.amountDue ?? null;

    // Update invoice-level summary fields
    await supabase
      .from('invoices')
      .update({ charges_total: chargesTotal, amount_due: amountDue })
      .eq('id', params.id);

    // Reconciliation check
    const sumOfCharges = charges.reduce((s, c) => s + c.amount, 0);
    const mismatch = chargesTotal != null && Math.abs(chargesTotal - sumOfCharges) > 0.01;
    const difference = chargesTotal != null ? chargesTotal - sumOfCharges : 0;

    const reconciliation = {
      sumOfCharges,
      chargesTotal,
      amountDue,
      mismatch,
      difference,
    };

    const mappedCount = mappings.filter((m) => m.bbox != null).length;

    await supabase.from('audit_logs').insert({
      company_id: userRecord.company_id,
      user_id: user.id,
      invoice_id: params.id,
      action: 'invoice_charges_parsed',
      metadata: {
        count: charges.length,
        chargesTotal,
        amountDue,
        mappedCount,
        mismatch,
        difference,
      } as unknown as never,
    });

    return NextResponse.json({
      charges: inserted ?? [],
      chargesTotal,
      amountDue,
      reconciliation,
      mappedCount,
    });
  } catch (err) {
    console.error('[api/invoices/[id]/charges/parse]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
