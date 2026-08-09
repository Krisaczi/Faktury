import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: u } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!u || !['owner'].includes(u.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const messageId = req.nextUrl.searchParams.get('id');
  if (!messageId) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: msg } = await (supabase as any)
    .from('contact_messages')
    .select('attachment_url, attachment_meta')
    .eq('id', messageId)
    .maybeSingle();

  if (!msg || !msg.attachment_url) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }

  const { data: fileData, error } = await supabase.storage
    .from('contact-attachments')
    .download(msg.attachment_url);

  if (error || !fileData) {
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
  }

  const meta = msg.attachment_meta as { filename?: string; mime_type?: string } | null;
  const filename = meta?.filename ?? 'attachment';
  const mimeType = meta?.mime_type ?? 'application/octet-stream';

  const headers = new Headers();
  headers.set('Content-Type', mimeType);
  headers.set(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(filename)}"`
  );

  return new NextResponse(fileData, { headers });
}
