import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

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
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, raw_file_url, company_id')
      .eq('id', params.id)
      .eq('company_id', userRecord.company_id)
      .maybeSingle();

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (!invoice.raw_file_url) {
      return NextResponse.json({ error: 'No file attached to this invoice' }, { status: 422 });
    }

    // Extract storage path from url or use directly as path
    const storagePath = invoice.raw_file_url.includes('/object/sign/')
      ? decodeURIComponent(invoice.raw_file_url.split('/object/sign/invoices/')[1]?.split('?')[0] ?? '')
      : invoice.raw_file_url.replace(/^.*invoices\//, '');

    const { data: urlData, error: urlError } = await supabase.storage
      .from('invoices')
      .createSignedUrl(storagePath, 300); // 5 minutes

    if (urlError || !urlData?.signedUrl) {
      return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
    }

    await supabase.from('audit_logs').insert({
      company_id: userRecord.company_id,
      user_id: user.id,
      invoice_id: params.id,
      action: 'invoice_download',
      metadata: {},
    });

    return NextResponse.json({ url: urlData.signedUrl });
  } catch (err) {
    console.error('[api/invoices/[id]/download]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
