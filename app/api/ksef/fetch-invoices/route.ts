import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import crypto from 'crypto';

const KSEF_TEST_URL = 'https://api-test.ksef.mf.gov.pl/v2';
const KSEF_PROD_URL = 'https://api.ksef.mf.gov.pl/v2';

// ─── KSeF 2.0 Auth ─────────────────────────────────────────────────────────────

interface KsefChallenge {
  challenge: string;
  timestamp: string;
  timestampMs: number;
}

interface KsefPublicKeyCert {
  certificateId: string;
  publicKeyId: string;
  certificate: string; // base64 DER
}

interface KsefAuthInitResponse {
  referenceNumber: string;
  authenticationToken: { token: string; validUntil: string };
}

async function getMfPublicKey(baseUrl: string): Promise<{ publicKeyId: string; publicKey: crypto.KeyObject }> {
  const res = await fetch(`${baseUrl}/security/public-key-certificates`);
  if (!res.ok) throw new Error(`Failed to fetch MF public keys (${res.status})`);
  const certs: KsefPublicKeyCert[] = await res.json();
  if (!certs.length) throw new Error('No MF public key certificates returned');
  // Use the first valid cert
  const cert = certs[0];
  const derBuffer = Buffer.from(cert.certificate, 'base64');
  const publicKey = crypto.createPublicKey({ key: derBuffer, format: 'der', type: 'spki' });
  return { publicKeyId: cert.publicKeyId, publicKey };
}

async function getChallenge(baseUrl: string): Promise<KsefChallenge> {
  const res = await fetch(`${baseUrl}/auth/challenge`, { method: 'POST' });
  if (!res.ok) throw new Error(`KSeF auth/challenge failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function encryptKsefToken(
  ksefToken: string,
  timestampMs: number,
  publicKey: crypto.KeyObject
): Promise<string> {
  const plaintext = `${ksefToken}|${timestampMs}`;
  const encrypted = crypto.publicEncrypt(
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(plaintext, 'utf8')
  );
  return encrypted.toString('base64');
}

async function initiateTokenAuth(
  baseUrl: string,
  nip: string,
  challenge: KsefChallenge,
  encryptedToken: string,
  publicKeyId: string
): Promise<KsefAuthInitResponse> {
  const res = await fetch(`${baseUrl}/auth/ksef-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      challenge: challenge.challenge,
      contextIdentifier: { type: 'Nip', value: nip },
      encryptedToken,
      publicKeyId,
    }),
  });
  if (!res.ok) throw new Error(`KSeF auth/ksef-token failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function pollAuthStatus(
  baseUrl: string,
  referenceNumber: string,
  authToken: string
): Promise<void> {
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(`${baseUrl}/auth/${referenceNumber}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error(`KSeF auth status poll failed (${res.status})`);
    const data = await res.json();
    const code: number = data.status?.code ?? 0;
    if (code === 200) return;
    if (code !== 100) {
      throw new Error(`KSeF authentication failed with status ${code}: ${data.status?.description ?? ''}`);
    }
  }
  throw new Error('KSeF authentication timed out');
}

async function redeemAccessToken(
  baseUrl: string,
  authToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(`${baseUrl}/auth/token/redeem`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error(`KSeF auth/token/redeem failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return {
    accessToken: data.accessToken.token,
    refreshToken: data.refreshToken.token,
  };
}

async function getKsefAccessToken(baseUrl: string, nip: string, ksefToken: string): Promise<string> {
  const [challenge, { publicKeyId, publicKey }] = await Promise.all([
    getChallenge(baseUrl),
    getMfPublicKey(baseUrl),
  ]);
  const encryptedToken = await encryptKsefToken(ksefToken, challenge.timestampMs, publicKey);
  const authInit = await initiateTokenAuth(baseUrl, nip, challenge, encryptedToken, publicKeyId);
  await pollAuthStatus(baseUrl, authInit.referenceNumber, authInit.authenticationToken.token);
  const { accessToken } = await redeemAccessToken(baseUrl, authInit.authenticationToken.token);
  return accessToken;
}

// ─── KSeF 2.0 Invoice Query ────────────────────────────────────────────────────

interface KsefInvoiceMeta {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  grossAmount: number;
  netAmount: number;
  vatAmount: number;
  currency: string;
  seller: { nip: string; name: string };
}

async function queryInvoiceMetadata(
  baseUrl: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string,
  pageOffset = 0
): Promise<{ invoices: KsefInvoiceMeta[]; hasMore: boolean }> {
  const res = await fetch(
    `${baseUrl}/invoices/query/metadata?pageOffset=${pageOffset}&pageSize=100&sortOrder=Asc`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        subjectType: 'Subject2',
        dateRange: { dateType: 'Invoicing', from: dateFrom, to: dateTo },
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KSeF invoice query failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return { invoices: data.invoices ?? [], hasMore: data.hasMore === true };
}

async function downloadInvoiceXml(
  baseUrl: string,
  accessToken: string,
  ksefNumber: string
): Promise<string> {
  const res = await fetch(`${baseUrl}/invoices/ksef/${encodeURIComponent(ksefNumber)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/xml' },
  });
  if (!res.ok) throw new Error(`Failed to download invoice ${ksefNumber} (${res.status})`);
  return res.text();
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { companyId, since } = body as { companyId: string; since?: string };
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });

    const { data: userRecord, error: userError } = await supabase
      .from('users').select('company_id').eq('id', user.id).maybeSingle();
    if (userError || userRecord?.company_id !== companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: company } = await supabase
      .from('companies').select('nip, currency').eq('id', companyId).maybeSingle();
    if (!company?.nip) {
      return NextResponse.json({ error: 'Company NIP not found. Please set your NIP in Settings.' }, { status: 404 });
    }

    const { data: creds } = await supabase
      .from('ksef_credentials').select('token, environment').eq('company_id', companyId).maybeSingle();
    if (!creds?.token) {
      return NextResponse.json(
        { error: 'KSeF credentials not configured. Please add your KSeF API token in Settings.', code: 'KSEF_CREDENTIALS_MISSING' },
        { status: 422 }
      );
    }

    const baseUrl = creds.environment === 'prod' ? KSEF_PROD_URL : KSEF_TEST_URL;
    const sessionId = crypto.randomUUID();
    const storagePath = `companies/${companyId}/uploads/${sessionId}`;

    const { data: session, error: sessionError } = await supabase
      .from('upload_sessions')
      .insert({ id: sessionId, company_id: companyId, user_id: user.id, source: 'ksef', status: 'processing', storage_path: storagePath })
      .select('id').single();
    if (sessionError || !session) return NextResponse.json({ error: 'Failed to create upload session' }, { status: 500 });

    const { data: job, error: jobError } = await supabase
      .from('parse_jobs')
      .insert({ upload_session_id: sessionId, status: 'processing', progress: 0 })
      .select('id').single();
    if (jobError || !job) return NextResponse.json({ error: 'Failed to create parse job' }, { status: 500 });

    runKsefFetch({ supabase, baseUrl, ksefToken: creds.token, nip: company.nip, companyId, sessionId, jobId: job.id, storagePath, since })
      .catch((err) => console.error('[ksef/fetch-invoices] background error', err));

    return NextResponse.json({ jobId: job.id, uploadSessionId: sessionId, status: 'processing' });
  } catch (err) {
    console.error('[ksef/fetch-invoices]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Background fetch ──────────────────────────────────────────────────────────

async function runKsefFetch({
  supabase, baseUrl, ksefToken, nip, companyId, sessionId, jobId, storagePath, since,
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
  try {
    await supabase.from('parse_jobs').update({ progress: 5 }).eq('id', jobId);

    // Authenticate
    const accessToken = await getKsefAccessToken(baseUrl, nip, ksefToken);
    await supabase.from('parse_jobs').update({ progress: 25 }).eq('id', jobId);

    // Date range — max 3 months per KSeF v2 limit; default last 90 days
    const dateTo = new Date().toISOString();
    const dateFrom = since
      ? new Date(since).toISOString()
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Paginate through all invoice metadata
    const allInvoices: KsefInvoiceMeta[] = [];
    let pageOffset = 0;
    let hasMore = true;
    while (hasMore) {
      const page = await queryInvoiceMetadata(baseUrl, accessToken, dateFrom, dateTo, pageOffset);
      allInvoices.push(...page.invoices);
      hasMore = page.hasMore;
      pageOffset += page.invoices.length;
    }

    await supabase.from('parse_jobs').update({ progress: 40 }).eq('id', jobId);

    let invoicesCreated = 0;
    let flagsCreated = 0;
    let errorCount = 0;
    const errors: { message: string; context?: string }[] = [];

    for (let i = 0; i < allInvoices.length; i++) {
      const meta = allInvoices[i];
      const ksefId = meta.ksefNumber;

      try {
        const xmlContent = await downloadInvoiceXml(baseUrl, accessToken, ksefId);
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

        const { data: urlData } = await supabase.storage.from('invoices').createSignedUrl(filePath, 3600);

        const { parseXmlInvoices } = await import('@/lib/parsers/xml-invoice-parser');
        const parseResult = await parseXmlInvoices(xmlContent);

        // If XML parser finds structured data, use it; otherwise fall back to KSeF metadata
        const invoiceList = parseResult.invoices.length > 0 ? parseResult.invoices : [{
          invoiceNumber: meta.invoiceNumber,
          invoiceDate: meta.issueDate,
          dueDate: null,
          totalAmount: meta.grossAmount,
          taxAmount: meta.vatAmount,
          currency: meta.currency,
          sellerNip: meta.seller?.nip ?? null,
          buyerNip: nip,
          bankAccount: null,
        }];

        for (const inv of invoiceList) {
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
          errors.push({ message: xmlErr.message, context: ksefId });
        }
      } catch (err) {
        errorCount++;
        errors.push({ message: err instanceof Error ? err.message : 'Unknown error', context: ksefId });
      }

      const progress = 40 + Math.round(((i + 1) / allInvoices.length) * 55);
      await supabase.from('parse_jobs').update({ progress }).eq('id', jobId);
    }

    await supabase.from('upload_sessions').update({
      status: errorCount > 0 && invoicesCreated === 0 ? 'failed' : 'completed',
      invoices_created: invoicesCreated,
      flags_created: flagsCreated,
      error_count: errorCount,
      error_detail: errors as unknown as never,
      file_count: allInvoices.length,
    }).eq('id', sessionId);

    await supabase.from('parse_jobs').update({
      status: 'completed',
      progress: 100,
      result: { invoicesCreated, flagsCreated, errorCount, errors, total: allInvoices.length } as unknown as never,
    }).eq('id', jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ksef/fetch-invoices] runKsefFetch error:', message);
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
