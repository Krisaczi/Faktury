import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

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

    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (userError || userRecord?.company_id !== companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('nip, currency')
      .eq('id', companyId)
      .maybeSingle();

    if (companyError || !company?.nip) {
      return NextResponse.json({ error: 'Company NIP not found. Please set your NIP in Settings.' }, { status: 404 });
    }

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

    fetchFromKSeF({
      supabase,
      baseUrl,
      ksefToken: creds.token,
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

async function initKsefSession(baseUrl: string, nip: string, ksefToken: string): Promise<string> {
  // Step 1: Get challenge
  const challengeRes = await fetch(`${baseUrl}/online/Session/AuthorisationChallenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ contextIdentifier: { type: 'onip', identifier: nip } }),
  });

  if (!challengeRes.ok) {
    const text = await challengeRes.text();
    throw new Error(`KSeF AuthorisationChallenge failed (${challengeRes.status}): ${text.slice(0, 300)}`);
  }

  const challengeData = await challengeRes.json();
  const challenge: string = challengeData.challenge;
  const timestamp: string = challengeData.timestamp;

  // Step 2: Init session with token
  // The token value combined with the timestamp is sent as the session token.
  // KSeF test environment accepts direct token auth via InitToken endpoint.
  const tokenRequestXml = buildInitTokenXml(nip, ksefToken, challenge, timestamp);

  const initRes = await fetch(`${baseUrl}/online/Session/InitToken`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      Accept: 'application/json',
    },
    body: tokenRequestXml,
  });

  if (!initRes.ok) {
    const text = await initRes.text();
    throw new Error(`KSeF InitToken failed (${initRes.status}): ${text.slice(0, 300)}`);
  }

  const initData = await initRes.json();
  const sessionToken: string = initData.sessionToken?.token ?? initData.sessionToken;
  if (!sessionToken) {
    throw new Error(`KSeF InitToken returned no session token: ${JSON.stringify(initData).slice(0, 200)}`);
  }
  return sessionToken;
}

function buildInitTokenXml(nip: string, token: string, challenge: string, timestamp: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ns3:InitSessionTokenRequest
  xmlns="http://ksef.mf.gov.pl/schema/gtw/svc/online/types/2021/10/01/0001"
  xmlns:ns2="http://ksef.mf.gov.pl/schema/gtw/svc/types/2021/10/01/0001"
  xmlns:ns3="http://ksef.mf.gov.pl/schema/gtw/svc/online/auth/request/2021/10/01/0001">
  <ns3:Context>
    <ns2:Challenge>${challenge}</ns2:Challenge>
    <ns2:Identifier xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="ns2:SubjectIdentifierByCompanyType">
      <ns2:Identifier>${nip}</ns2:Identifier>
    </ns2:Identifier>
    <ns2:DocumentType>
      <ns2:Service>KSeF</ns2:Service>
      <ns2:FormCode>
        <ns2:SystemCode>FA (2)</ns2:SystemCode>
        <ns2:SchemaVersion>1-0E</ns2:SchemaVersion>
        <ns2:TargetNamespace>http://crd.gov.pl/wzor/2023/06/29/12648/</ns2:TargetNamespace>
        <ns2:Value>FA</ns2:Value>
      </ns2:FormCode>
    </ns2:DocumentType>
    <ns3:Token>${token}</ns3:Token>
  </ns3:Context>
</ns3:InitSessionTokenRequest>`;
}

async function terminateKsefSession(baseUrl: string, sessionToken: string): Promise<void> {
  try {
    await fetch(`${baseUrl}/online/Session/Terminate`, {
      method: 'GET',
      headers: { Accept: 'application/json', SessionToken: sessionToken },
    });
  } catch {
    // Best-effort — don't fail the whole job over this
  }
}

async function fetchFromKSeF({
  supabase,
  baseUrl,
  ksefToken,
  nip,
  companyId,
  sessionId,
  jobId,
  storagePath,
  since,
}: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  baseUrl: string;
  ksefToken: string;
  nip: string;
  companyId: string;
  sessionId: string;
  jobId: string;
  storagePath: string;
  since?: string;
}) {
  let sessionToken: string | null = null;

  try {
    await supabase.from('parse_jobs').update({ progress: 5 }).eq('id', jobId);

    // Authenticate and get KSeF session token
    sessionToken = await initKsefSession(baseUrl, nip, ksefToken);

    await supabase.from('parse_jobs').update({ progress: 20 }).eq('id', jobId);

    // Build date range — default to last 90 days if no since provided
    const dateTo = new Date();
    const dateFrom = since ? new Date(since) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const dateFromStr = dateFrom.toISOString().replace(/\.\d{3}Z$/, '+00:00');
    const dateToStr = dateTo.toISOString().replace(/\.\d{3}Z$/, '+00:00');

    // Query Podmiot2 (purchase invoices) — correct endpoint and body
    const queryRes = await fetch(
      `${baseUrl}/online/Query/Invoice/Sync?PageSize=100&PageOffset=0`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          SessionToken: sessionToken,
        },
        body: JSON.stringify({
          queryCriteria: {
            subjectType: 'subject2',
            type: 'incremental',
            acquisitionTimestampThresholdFrom: dateFromStr,
            acquisitionTimestampThresholdTo: dateToStr,
          },
        }),
      }
    );

    if (!queryRes.ok) {
      const text = await queryRes.text();
      throw new Error(`KSeF query failed (${queryRes.status}): ${text.slice(0, 300)}`);
    }

    const queryData = await queryRes.json();
    const invoiceRefs: Array<{ ksefReferenceNumber: string }> =
      queryData.invoiceHeaderList ?? queryData.invoiceHeaderList ?? [];

    await supabase.from('parse_jobs').update({ progress: 40 }).eq('id', jobId);

    let invoicesCreated = 0;
    let flagsCreated = 0;
    let errorCount = 0;
    const errors: { message: string; context?: string }[] = [];

    for (let i = 0; i < invoiceRefs.length; i++) {
      const ref = invoiceRefs[i];
      const ksefId = ref.ksefReferenceNumber ?? `invoice-${i}`;

      try {
        const xmlRes = await fetch(`${baseUrl}/online/Invoice/Get/${ksefId}`, {
          headers: {
            Accept: 'application/octet-stream',
            SessionToken: sessionToken,
          },
        });

        if (!xmlRes.ok) {
          errorCount++;
          errors.push({ message: `Failed to fetch invoice ${ksefId} (${xmlRes.status})`, context: ksefId });
          continue;
        }

        const xmlContent = await xmlRes.text();
        const filename = `${ksefId}.xml`;
        const filePath = `${storagePath}/${filename}`;

        const { error: storageError } = await supabase.storage
          .from('invoices')
          .upload(filePath, xmlContent, { contentType: 'application/xml', upsert: true });

        if (storageError) {
          errorCount++;
          errors.push({ message: `Storage upload failed for ${ksefId}`, context: ksefId });
          continue;
        }

        const { data: urlData } = await supabase.storage
          .from('invoices')
          .createSignedUrl(filePath, 3600);

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

      const progress = 40 + Math.round(((i + 1) / invoiceRefs.length) * 55);
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
    console.error('[ksef/fetch-invoices] fetchFromKSeF error:', message);
    await supabase.from('parse_jobs').update({
      status: 'failed',
      result: { error: message } as unknown as never,
    }).eq('id', jobId);
    await supabase.from('upload_sessions').update({
      status: 'failed',
      error_detail: [{ message }] as unknown as never,
    }).eq('id', sessionId);
  } finally {
    if (sessionToken) {
      await terminateKsefSession(baseUrl, sessionToken);
    }
  }
}
