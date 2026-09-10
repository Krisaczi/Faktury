import { createHash, createPublicKey, publicEncrypt, constants, randomBytes, createCipheriv } from 'node:crypto';

/**
 * KSeF 2.0 invoice submission service.
 *
 * Implements the session-based flow required by KSeF 2.0:
 * 1. Authenticate via token-auth flow (challenge → encrypt → init → poll → redeem)
 * 2. Open an interactive online session
 * 3. Send the invoice within the session
 * 4. Poll for invoice processing status
 * 5. Close the session
 */

export type KsefStatus = 'pending' | 'queued' | 'submitted' | 'accepted' | 'rejected' | 'failed';

export interface KsefSubmissionResult {
  success:       boolean;
  ksefNumber?:   string;
  submissionId?: string;
  status:        KsefStatus;
  response:      Record<string, unknown>;
  error?:        string;
  transient:     boolean;
}

interface KsefCredentials {
  token:        string;
  environment:  'test' | 'prod';
}

const KSEF_BASE_URLS = {
  test: 'https://api-test.ksef.mf.gov.pl/v2',
  prod: 'https://api.ksef.mf.gov.pl/v2',
} as const;

export function generateIdempotencyKey(invoiceId: string): string {
  return createHash('sha256').update(`ksef-submit:${invoiceId}`).digest('hex');
}

// ─── Auth ──────────────────────────────────────────────────────────────────

interface KsefPublicKeyCert {
  certificateId: string;
  publicKeyId: string;
  certificate: string;
  usage?: string;
}

async function getMfPublicKey(baseUrl: string): Promise<{ publicKeyId: string; publicKey: ReturnType<typeof createPublicKey> }> {
  const res = await fetch(`${baseUrl}/security/public-key-certificates`);
  if (!res.ok) throw new Error(`Failed to fetch MF public keys (${res.status})`);
  const certs: KsefPublicKeyCert[] = await res.json();
  if (!certs.length) throw new Error('No MF public key certificates returned');

  const usageStr = (c: KsefPublicKeyCert) => JSON.stringify(c.usage ?? '').toLowerCase();
  const tokenCert =
    certs.find((c) => usageStr(c).includes('token')) ??
    certs.find((c) => !usageStr(c).includes('symmetric')) ??
    certs[0];

  const pem = `-----BEGIN CERTIFICATE-----\n${tokenCert.certificate.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;
  return { publicKeyId: tokenCert.publicKeyId, publicKey: createPublicKey(pem) };
}

async function getKsefAccessToken(
  credentials: KsefCredentials,
  companyNip: string,
): Promise<{ accessToken: string; baseUrl: string } | { error: string; transient: boolean }> {
  const baseUrl = KSEF_BASE_URLS[credentials.environment];

  try {
    // 1. Get challenge
    const challengeRes = await fetch(`${baseUrl}/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!challengeRes.ok) {
      return { error: `KSeF challenge failed: ${challengeRes.status}`, transient: true };
    }
    const challenge = await challengeRes.json() as { challenge: string; timestamp: string; timestampMs: number };

    // 2. Get MF public key for token encryption
    const { publicKeyId, publicKey } = await getMfPublicKey(baseUrl);

    // 3. Encrypt token
    const tokenPayload = `${credentials.token}|${challenge.timestampMs}`;
    const plaintextBuf = Buffer.from(tokenPayload, 'utf-8');
    if (plaintextBuf.length > 190) {
      return {
        error: `KSeF token too long (${plaintextBuf.length} bytes, max 190). Please re-enter a single token in Settings.`,
        transient: false,
      };
    }
    const encrypted = publicEncrypt(
      { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      plaintextBuf,
    );
    const encryptedToken = encrypted.toString('base64');

    // 4. Initiate token auth
    const initRes = await fetch(`${baseUrl}/auth/ksef-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        challenge: challenge.challenge,
        contextIdentifier: { type: 'Nip', value: companyNip },
        encryptedToken,
        publicKeyId,
      }),
    });
    if (!initRes.ok) {
      const errBody = await initRes.text().catch(() => '');
      return { error: `KSeF auth init failed: ${initRes.status} ${errBody.slice(0, 300)}`, transient: true };
    }
    const initResult = await initRes.json() as { referenceNumber: string; authenticationToken: { token: string; validUntil: string } };

    // 5. Poll auth status
    let authToken: string | null = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const statusRes = await fetch(`${baseUrl}/auth/${initResult.referenceNumber}`, {
        headers: { Authorization: `Bearer ${initResult.authenticationToken.token}` },
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json().catch(() => ({})) as { status?: { code?: number; description?: string } };
        const code: number = statusData.status?.code ?? 0;
        if (code === 200) {
          authToken = initResult.authenticationToken.token;
          break;
        }
        if (code !== 100) {
          return { error: `KSeF authentication failed (status ${code}): ${statusData.status?.description ?? ''}`, transient: false };
        }
      } else if (statusRes.status !== 100) {
        return { error: `KSeF auth polling failed: ${statusRes.status}`, transient: true };
      }
    }
    if (!authToken) {
      return { error: 'KSeF auth polling timed out', transient: true };
    }

    // 6. Redeem access token
    const redeemRes = await fetch(`${baseUrl}/auth/token/redeem`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!redeemRes.ok) {
      return { error: `KSeF token redeem failed: ${redeemRes.status}`, transient: true };
    }
    const redeemResult = await redeemRes.json() as { accessToken: { token: string } };

    return { accessToken: redeemResult.accessToken.token, baseUrl };
  } catch (err) {
    return { error: `KSeF auth error: ${(err as Error).message}`, transient: true };
  }
}

// ─── Session-based invoice submission ──────────────────────────────────────

async function getSymmetricKeyCert(baseUrl: string): Promise<{ publicKeyId: string; publicKey: ReturnType<typeof createPublicKey> }> {
  const res = await fetch(`${baseUrl}/security/public-key-certificates`);
  if (!res.ok) throw new Error(`Failed to fetch MF public keys (${res.status})`);
  const certs: KsefPublicKeyCert[] = await res.json();
  if (!certs.length) throw new Error('No MF public key certificates returned');

  const usageStr = (c: KsefPublicKeyCert) => JSON.stringify(c.usage ?? '').toLowerCase();
  const symCert =
    certs.find((c) => usageStr(c).includes('symmetric')) ??
    certs.find((c) => !usageStr(c).includes('token')) ??
    certs[0];

  const pem = `-----BEGIN CERTIFICATE-----\n${symCert.certificate.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;
  return { publicKeyId: symCert.publicKeyId, publicKey: createPublicKey(pem) };
}

async function openOnlineSession(
  baseUrl: string,
  accessToken: string,
): Promise<{ sessionId: string; referenceNumber: string; aesKey: Buffer; initVector: Buffer } | { error: string; transient: boolean }> {
  try {
    // Generate AES-256 key and IV for session encryption
    const aesKey = randomBytes(32);
    const initVector = randomBytes(16);

    // Encrypt the AES key with the KSeF SymmetricKeyEncryption public key
    const { publicKey, publicKeyId } = await getSymmetricKeyCert(baseUrl);
    const encryptedKey = publicEncrypt(
      { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      aesKey,
    ).toString('base64');

    const res = await fetch(`${baseUrl}/sessions/online`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        invoiceVersion: 'v3',
        encryptionInfo: {
          encryptedKey,
          initVector: initVector.toString('base64'),
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { error: `KSeF session open failed: ${res.status} ${errBody.slice(0, 300)}`, transient: res.status >= 500 };
    }

    const data = await res.json() as { referenceNumber: string; sessionId?: string; id?: string };
    const sessionId = data.sessionId ?? data.id ?? data.referenceNumber;

    return { sessionId, referenceNumber: data.referenceNumber, aesKey, initVector };
  } catch (err) {
    return { error: `KSeF session open error: ${(err as Error).message}`, transient: true };
  }
}

async function closeOnlineSession(
  baseUrl: string,
  accessToken: string,
  referenceNumber: string,
): Promise<void> {
  try {
    await fetch(`${baseUrl}/sessions/online/${referenceNumber}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // Best-effort — don't fail the submission if close fails
  }
}

async function sendInvoiceInSession(
  baseUrl: string,
  accessToken: string,
  sessionRef: string,
  signedXml: string,
  aesKey: Buffer,
  initVector: Buffer,
): Promise<{ success: boolean; invoiceId?: string; status: KsefStatus; response: Record<string, unknown>; error?: string; transient: boolean }> {
  try {
    const xmlBuffer = Buffer.from(signedXml, 'utf-8');
    const invoiceHash = createHash('sha256').update(xmlBuffer).digest('base64');
    const invoiceSize = xmlBuffer.length;

    // Encrypt the XML with AES-256-CBC
    const cipher = createCipheriv('aes-256-cbc', aesKey, initVector);
    const encrypted = Buffer.concat([cipher.update(xmlBuffer), cipher.final()]);
    const encryptedInvoice = encrypted.toString('base64');

    const res = await fetch(`${baseUrl}/sessions/online/${sessionRef}/invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        encrypted: {
          encryptedInvoice,
          invoiceHash,
          invoiceSize,
        },
      }),
    });

    const responseBody = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (res.ok || res.status === 201) {
      const invoiceId = (responseBody.id ?? responseBody.invoiceId) as string | undefined;
      return {
        success: true,
        invoiceId,
        status: 'submitted',
        response: responseBody,
        transient: false,
      };
    }

    if (res.status === 400 || res.status === 422) {
      return {
        success: false,
        status: 'rejected',
        response: responseBody,
        error: (responseBody.message ?? responseBody.error ?? 'KSeF rejected the invoice') as string,
        transient: false,
      };
    }

    return {
      success: false,
      status: 'queued',
      response: responseBody,
      error: `KSeF send failed: HTTP ${res.status}`,
      transient: true,
    };
  } catch (err) {
    return {
      success: false,
      status: 'queued',
      response: { error: (err as Error).message },
      error: `KSeF send error: ${(err as Error).message}`,
      transient: true,
    };
  }
}

async function checkInvoiceStatus(
  baseUrl: string,
  accessToken: string,
  invoiceId: string,
): Promise<{ ksefNumber?: string; status: KsefStatus; processingCode?: number }> {
  try {
    const res = await fetch(`${baseUrl}/invoices/${invoiceId}/status`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });

    if (!res.ok) {
      return { status: 'submitted' };
    }

    const data = await res.json() as Record<string, unknown>;
    const statusObj = data.status as { code?: number } | undefined;
    const processingCode = (data.processingCode ?? statusObj?.code ?? 0) as number;
    const ksefNumber = (data.ksefReferenceNumber ?? data.ksefNumber ?? data.elementReferenceNumber) as string | undefined;

    if (processingCode === 200 || ksefNumber) {
      return { ksefNumber, status: 'accepted', processingCode };
    }
    if (processingCode === 400 || processingCode === 422) {
      return { status: 'rejected', processingCode };
    }

    return { status: 'submitted', processingCode };
  } catch {
    return { status: 'submitted' };
  }
}

// ─── Main entry point ──────────────────────────────────────────────────────

export async function submitToKsef(params: {
  invoiceId:       string;
  signedXml:       string;
  idempotencyKey:  string;
  credentials:     KsefCredentials;
  companyNip:      string;
  existingKsefNumber?: string | null;
}): Promise<KsefSubmissionResult> {
  const { invoiceId, signedXml, idempotencyKey, credentials, companyNip, existingKsefNumber } = params;

  // Idempotency: if already submitted, return existing result
  if (existingKsefNumber) {
    return {
      success:      true,
      ksefNumber:   existingKsefNumber,
      status:       'accepted',
      response:     { message: 'Already submitted', ksefNumber: existingKsefNumber },
      transient:    false,
    };
  }

  // Step 1: Authenticate
  const authResult = await getKsefAccessToken(credentials, companyNip);
  if ('error' in authResult) {
    return {
      success:   false,
      status:    authResult.transient ? 'queued' : 'rejected',
      response:  { error: authResult.error },
      error:     authResult.error,
      transient: authResult.transient,
    };
  }

  const { accessToken, baseUrl } = authResult;

  // Step 2: Open an interactive session
  const sessionResult = await openOnlineSession(baseUrl, accessToken);
  if ('error' in sessionResult) {
    return {
      success:   false,
      status:    sessionResult.transient ? 'queued' : 'rejected',
      response:  { error: sessionResult.error },
      error:     sessionResult.error,
      transient: sessionResult.transient,
    };
  }

  const { referenceNumber: sessionRef, aesKey, initVector } = sessionResult;

  // Step 3: Send the invoice within the session
  const sendResult = await sendInvoiceInSession(baseUrl, accessToken, sessionRef, signedXml, aesKey, initVector);

  // Step 4: If send succeeded, poll for processing status (a few attempts)
  if (sendResult.success && sendResult.invoiceId) {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusResult = await checkInvoiceStatus(baseUrl, accessToken, sendResult.invoiceId);
      if (statusResult.status === 'accepted' && statusResult.ksefNumber) {
        // Step 5: Close the session
        await closeOnlineSession(baseUrl, accessToken, sessionRef);
        return {
          success:       true,
          ksefNumber:    statusResult.ksefNumber,
          submissionId:  sendResult.invoiceId,
          status:        'accepted',
          response:      { ...sendResult.response, ksefNumber: statusResult.ksefNumber, processingCode: statusResult.processingCode },
          transient:     false,
        };
      }
      if (statusResult.status === 'rejected') {
        await closeOnlineSession(baseUrl, accessToken, sessionRef);
        return {
          success:   false,
          status:    'rejected',
          response:  { ...sendResult.response, processingCode: statusResult.processingCode },
          error:     'KSeF rejected the invoice during processing',
          transient: false,
        };
      }
    }

    // Still processing after 3 polls — close session, return submitted status
    await closeOnlineSession(baseUrl, accessToken, sessionRef);
    return {
      success:       true,
      submissionId:  sendResult.invoiceId,
      status:        'submitted',
      response:      sendResult.response,
      transient:     false,
    };
  }

  // Send failed — close the session and return the error
  await closeOnlineSession(baseUrl, accessToken, sessionRef);

  return {
    success:   sendResult.success,
    status:    sendResult.status,
    response:  sendResult.response,
    error:     sendResult.error,
    transient: sendResult.transient,
  };
}

// ─── Status check (for polling previously submitted invoices) ──────────────

export async function checkKsefStatus(params: {
  submissionId:   string;
  credentials:    KsefCredentials;
  companyNip:     string;
}): Promise<KsefSubmissionResult> {
  const authResult = await getKsefAccessToken(params.credentials, params.companyNip);
  if ('error' in authResult) {
    return {
      success:   false,
      status:    'queued',
      response:  { error: authResult.error },
      error:     authResult.error,
      transient: authResult.transient,
    };
  }

  const { accessToken, baseUrl } = authResult;
  const statusResult = await checkInvoiceStatus(baseUrl, accessToken, params.submissionId);

  if (statusResult.status === 'accepted' && statusResult.ksefNumber) {
    return {
      success:     true,
      ksefNumber:  statusResult.ksefNumber,
      submissionId: params.submissionId,
      status:      'accepted',
      response:    { processingCode: statusResult.processingCode },
      transient:   false,
    };
  }

  if (statusResult.status === 'rejected') {
    return {
      success:   false,
      status:    'rejected',
      response:  { processingCode: statusResult.processingCode },
      error:     'KSeF rejected the invoice',
      transient: false,
    };
  }

  return {
    success:   false,
    status:    'submitted',
    response:  { processingCode: statusResult.processingCode },
    transient: true,
  };
}
