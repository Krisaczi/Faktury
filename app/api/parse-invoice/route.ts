import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { parseXmlInvoices } from '@/lib/parsers/xml-invoice-parser';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { fileUrl, uploadSessionId, companyId, fileType } = body as {
      fileUrl: string;
      uploadSessionId: string;
      companyId: string;
      fileType: string;
    };

    if (!fileUrl || !uploadSessionId || !companyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the session belongs to this user's company
    const { data: session, error: sessionError } = await supabase
      .from('upload_sessions')
      .select('id, company_id, status')
      .eq('id', uploadSessionId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Upload session not found or access denied' }, { status: 403 });
    }

    // Mark session as processing
    await supabase
      .from('upload_sessions')
      .update({ status: 'processing' })
      .eq('id', uploadSessionId);

    // Create a parse job for polling
    const { data: job, error: jobError } = await supabase
      .from('parse_jobs')
      .insert({
        upload_session_id: uploadSessionId,
        status: 'processing',
        progress: 0,
      })
      .select('id')
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Failed to create parse job' }, { status: 500 });
    }

    // Run parsing asynchronously (fire-and-forget via EdgeRuntime if available, else inline)
    parseAndIngest({
      supabase,
      fileUrl,
      uploadSessionId,
      companyId,
      jobId: job.id,
      fileType,
    }).catch((err) => console.error('[parse-invoice] background error', err));

    return NextResponse.json({ jobId: job.id, status: 'processing' });
  } catch (err) {
    console.error('[parse-invoice]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function parseAndIngest({
  supabase,
  fileUrl,
  uploadSessionId,
  companyId,
  jobId,
  fileType,
}: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  fileUrl: string;
  uploadSessionId: string;
  companyId: string;
  jobId: string;
  fileType: string;
}) {
  let invoicesCreated = 0;
  let flagsCreated = 0;
  let errorCount = 0;
  const errors: { message: string; context?: string }[] = [];

  try {
    // Download the file via signed URL or direct fetch
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_FILE_SIZE) {
      throw new Error('File exceeds 50MB limit');
    }

    const fileContent = await response.text();
    const normalizedType = fileType.toLowerCase();

    if (normalizedType === 'xml' || fileUrl.toLowerCase().endsWith('.xml')) {
      const result = await parseXmlInvoices(fileContent);

      for (const inv of result.invoices) {
        const { data: invoice, error: invError } = await supabase
          .from('invoices')
          .insert({
            company_id: companyId,
            invoice_number: inv.invoiceNumber ?? null,
            invoice_date: inv.invoiceDate ?? null,
            issue_date: inv.invoiceDate ?? null,
            due_date: inv.dueDate ?? null,
            amount: inv.totalAmount ?? null,
            total_amount: inv.totalAmount ?? null,
            tax_amount: inv.taxAmount ?? null,
            currency: inv.currency ?? 'PLN',
            seller_nip: inv.sellerNip ?? null,
            buyer_nip: inv.buyerNip ?? null,
            bank_account: inv.bankAccount ?? null,
            raw_file_url: fileUrl,
            upload_session_id: uploadSessionId,
            overall_risk: null,
          })
          .select('id')
          .single();

        if (invError || !invoice) {
          errorCount++;
          errors.push({ message: invError?.message ?? 'Insert failed', context: inv.invoiceNumber });
          continue;
        }

        invoicesCreated++;

        // Basic risk flags
        const flags: { flag_type: string; severity: 'info' | 'low' | 'medium' | 'high' | 'critical'; message: string }[] = [];

        if (!inv.sellerNip) {
          flags.push({ flag_type: 'missing_seller_nip', severity: 'medium', message: 'Seller NIP not found in XML' });
        }
        if (!inv.bankAccount) {
          flags.push({ flag_type: 'missing_bank_account', severity: 'medium', message: 'Bank account not present in invoice' });
        }
        if (inv.totalAmount && inv.totalAmount > 50000) {
          flags.push({ flag_type: 'high_value', severity: 'high', message: `High-value invoice: ${inv.currency ?? 'PLN'} ${inv.totalAmount}` });
        }

        if (flags.length > 0) {
          for (const flag of flags) {
            const { error: flagError } = await supabase.from('risk_flags').insert({
              invoice_id: invoice.id,
              type: flag.flag_type,
              severity: flag.severity,
              message: flag.message,
            });
            if (!flagError) flagsCreated++;
          }

          // Update overall_risk
          const severityOrder = ['info', 'low', 'medium', 'high', 'critical'] as const;
          type SeverityLevel = typeof severityOrder[number];
          const maxSeverity = flags.reduce<SeverityLevel>((acc, f) => {
            return severityOrder.indexOf(f.severity) > severityOrder.indexOf(acc) ? f.severity : acc;
          }, 'low') as 'low' | 'medium' | 'high' | 'critical';

          await supabase
            .from('invoices')
            .update({ overall_risk: maxSeverity })
            .eq('id', invoice.id);
        }
      }

      // Collect XML parsing errors
      for (const xmlErr of result.errors) {
        errorCount++;
        errors.push({ message: xmlErr.message, context: xmlErr.context });
      }
    } else {
      // Non-XML: record a placeholder invoice for the upload
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .insert({
          company_id: companyId,
          raw_file_url: fileUrl,
          upload_session_id: uploadSessionId,
          currency: 'PLN',
        })
        .select('id')
        .single();

      if (!invError && invoice) invoicesCreated++;
    }

    // Update upload session
    await supabase.from('upload_sessions').update({
      status: errorCount > 0 && invoicesCreated === 0 ? 'failed' : 'completed',
      invoices_created: invoicesCreated,
      flags_created: flagsCreated,
      error_count: errorCount,
      error_detail: errors as unknown as never,
    }).eq('id', uploadSessionId);

    // Update parse job
    await supabase.from('parse_jobs').update({
      status: 'completed',
      progress: 100,
      result: {
        invoicesCreated,
        flagsCreated,
        errorCount,
        errors,
      } as unknown as never,
    }).eq('id', jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await supabase.from('parse_jobs').update({
      status: 'failed',
      progress: 0,
      result: { error: message } as unknown as never,
    }).eq('id', jobId);

    await supabase.from('upload_sessions').update({
      status: 'failed',
      error_count: 1,
      error_detail: [{ message }] as unknown as never,
    }).eq('id', uploadSessionId);
  }
}
