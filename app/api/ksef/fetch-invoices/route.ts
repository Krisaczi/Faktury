import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

// KSeF test environment base URL
const KSEF_TEST_URL = 'https://ksef-test.mf.gov.pl/api';
const KSEF_PROD_URL = 'https://ksef.mf.gov.pl/api';

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
    const { companyId, since } = body as { companyId: string; since?: string };

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    // Verify the caller belongs to this company
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (userError || userRecord?.company_id !== companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch company NIP
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('nip, currency')
      .eq('id', companyId)
      .maybeSingle();

    if (companyError || !company?.nip) {
      return NextResponse.json({ error: 'Company NIP not found' }, { status: 404 });
    }

    // Fetch KSeF credentials (owner-only access enforced by RLS)
    const { data: creds, error: credsError } = await supabase
      .from('ksef_credentials')
      .select('token, environment')
      .eq('company_id', companyId)
      .maybeSingle();

    if (credsError || !creds?.token) {
      return NextResponse.json(
        {
          error: 'KSeF credentials not configured. Please add your KSeF API token in Settings.',
          code: 'KSEF_CREDENTIALS_MISSING',
        },
        { status: 422 }
      );
    }

    const baseUrl = creds.environment === 'prod' ? KSEF_PROD_URL : KSEF_TEST_URL;

    // Create an upload session for this KSeF fetch
    const sessionId = crypto.randomUUID();
    const storagePath = `companies/${companyId}/uploads/${sessionId}`;

    const { data: session, error: sessionError } = await supabase
      .from('upload_sessions')
      .insert({
        id: sessionId,
        company_id: companyId,
        user_id: user.id,
        source: 'ksef',
        status: 'processing',
        storage_path: storagePath,
      })
      .select('id')
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Failed to create upload session' }, { status: 500 });
    }

    // Create a parse job to track progress
    const { data: job, error: jobError } = await supabase
      .from('parse_jobs')
      .insert({
        upload_session_id: sessionId,
        status: 'processing',
        progress: 0,
      })
      .select('id')
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Failed to create parse job' }, { status: 500 });
    }

    // Fire KSeF fetch in background
    fetchFromKSeF({
      supabase,
      baseUrl,
      token: creds.token,
      nip: company.nip,
      companyId,
      sessionId,
      jobId: job.id,
      storagePath,
      since,
    }).catch((err) => console.error('[ksef/fetch-invoices] background error', err));

    return NextResponse.json({
      jobId: job.id,
      uploadSessionId: sessionId,
      status: 'processing',
      message: 'KSeF fetch started. Poll /api/job-status?jobId= for progress.',
    });
  } catch (err) {
    console.error('[ksef/fetch-invoices]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function fetchFromKSeF({
  supabase,
  baseUrl,
  token,
  nip,
  companyId,
  sessionId,
  jobId,
  storagePath,
  since,
}: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  baseUrl: string;
  token: string;
  nip: string;
  companyId: string;
  sessionId: string;
  jobId: string;
  storagePath: string;
  since?: string;
}) {
  try {
    await supabase.from('parse_jobs').update({ progress: 10 }).eq('id', jobId);

    // Step 1: Authenticate with KSeF
    const authBody = {
      contextIdentifier: { type: 'onip', identifier: nip },
      contextName: { type: 'service', serviceName: 'KSeF' },
    };

    const authResponse = await fetch(`${baseUrl}/online/Session/AuthorisationChallenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(authBody),
    });

    if (!authResponse.ok) {
      const errText = await authResponse.text();
      throw new Error(`KSeF auth failed (${authResponse.status}): ${errText.slice(0, 200)}`);
    }

    await supabase.from('parse_jobs').update({ progress: 30 }).eq('id', jobId);

    // Step 2: Query invoices
    const queryParams = new URLSearchParams({
      pageSize: '100',
      pageOffset: '0',
    });
    if (since) queryParams.set('dateFrom', since);

    const invoicesResponse = await fetch(
      `${baseUrl}/online/Invoice/Query/Invoice/Sync?${queryParams}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!invoicesResponse.ok) {
      const errText = await invoicesResponse.text();
      throw new Error(`KSeF query failed (${invoicesResponse.status}): ${errText.slice(0, 200)}`);
    }

    const invoicesData = await invoicesResponse.json();
    const invoiceRefs = invoicesData.invoiceHeaderList ?? [];

    await supabase.from('parse_jobs').update({ progress: 50 }).eq('id', jobId);

    let invoicesCreated = 0;
    let flagsCreated = 0;
    let errorCount = 0;
    const errors: { message: string; context?: string }[] = [];

    // Step 3: Download and store each XML invoice
    for (let i = 0; i < invoiceRefs.length; i++) {
      const ref = invoiceRefs[i];
      const ksefId = ref.ksefReferenceNumber ?? `invoice-${i}`;

      try {
        const xmlResponse = await fetch(`${baseUrl}/online/Invoice/Get/${ksefId}`, {
          headers: {
            Accept: 'application/octet-stream',
            Authorization: `Bearer ${token}`,
          },
        });

        if (!xmlResponse.ok) {
          errorCount++;
          errors.push({ message: `Failed to fetch invoice ${ksefId}`, context: ksefId });
          continue;
        }

        const xmlContent = await xmlResponse.text();
        const filename = `${ksefId}.xml`;
        const filePath = `${storagePath}/${filename}`;

        // Store XML in Supabase Storage
        const { error: storageError } = await supabase.storage
          .from('invoices')
          .upload(filePath, xmlContent, {
            contentType: 'application/xml',
            upsert: true,
          });

        if (storageError) {
          errorCount++;
          errors.push({ message: `Storage upload failed for ${ksefId}`, context: ksefId });
          continue;
        }

        // Get public/signed URL
        const { data: urlData } = await supabase.storage
          .from('invoices')
          .createSignedUrl(filePath, 3600);

        // Parse and ingest the XML via inline parse
        const { parseXmlInvoices } = await import('@/lib/parsers/xml-invoice-parser');
        const parseResult = await parseXmlInvoices(xmlContent);

        for (const inv of parseResult.invoices) {
          const { data: invoice, error: invError } = await supabase
            .from('invoices')
            .insert({
              company_id: companyId,
              invoice_number: inv.invoiceNumber ?? ksefId,
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
              raw_file_url: urlData?.signedUrl ?? filePath,
              upload_session_id: sessionId,
            })
            .select('id')
            .single();

          if (!invError && invoice) {
            invoicesCreated++;

            // Risk flags
            if (!inv.sellerNip) {
              const { error: fe } = await supabase.from('risk_flags').insert({
                invoice_id: invoice.id,
                type: 'missing_seller_nip',
                severity: 'medium',
                message: 'Seller NIP not found in KSeF XML',
              });
              if (!fe) flagsCreated++;
            }
          } else {
            errorCount++;
            errors.push({ message: invError?.message ?? 'Insert failed', context: ksefId });
          }
        }

        for (const xmlErr of parseResult.errors) {
          errorCount++;
          errors.push({ message: xmlErr.message, context: ksefId });
        }
      } catch (err) {
        errorCount++;
        errors.push({
          message: err instanceof Error ? err.message : 'Unknown error',
          context: ksefId,
        });
      }

      // Update progress proportionally
      const progress = 50 + Math.round(((i + 1) / invoiceRefs.length) * 45);
      await supabase.from('parse_jobs').update({ progress }).eq('id', jobId);
    }

    await supabase.from('upload_sessions').update({
      status: errorCount > 0 && invoicesCreated === 0 ? 'failed' : 'completed',
      invoices_created: invoicesCreated,
      flags_created: flagsCreated,
      error_count: errorCount,
      error_detail: errors as unknown as never,
      file_count: invoiceRefs.length,
    }).eq('id', sessionId);

    await supabase.from('parse_jobs').update({
      status: 'completed',
      progress: 100,
      result: { invoicesCreated, flagsCreated, errorCount, errors, total: invoiceRefs.length } as unknown as never,
    }).eq('id', jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await supabase.from('parse_jobs').update({
      status: 'failed',
      result: { error: message } as unknown as never,
    }).eq('id', jobId);
    await supabase.from('upload_sessions').update({
      status: 'failed',
      error_detail: [{ message }] as unknown as never,
    }).eq('id', sessionId);
  }
}
