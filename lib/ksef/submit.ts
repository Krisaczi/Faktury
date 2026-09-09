import { createHash } from 'node:crypto';

/**
 * KSeF invoice submission service.
 *
 * Handles sending signed FA(2) XML to KSeF's /v2/invoices/send endpoint,
 * tracking submission status, and providing idempotent retry logic.
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

interface KsefCompanyInfo {
  nip:     string;
  companyId: string;
}

const KSEF_BASE_URLS = {
  test: 'https://api-test.ksef.mf.gov.pl/v2',
  prod: 'https://api.ksef.mf.gov.pl/v2',
} as const;

/**
 * Generate a deterministic idempotency key from invoice ID.
 * This ensures retries for the same invoice don't create duplicate submissions.
 */
export function generateIdempotencyKey(invoiceId: string): string {
  return createHash('sha256').update(`ksef-submit:${invoiceId}`).digest('hex');
}

/**
 * Fetch a KSeF access token using the token-auth flow.
 * Reuses the same challenge → encrypt → initiate → poll → redeem pattern
 * as the invoice fetch route.
 */
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
    const challenge = await challengeRes.json() as { challenge: string; timestamp: string; timestampMs: string };

    // 2. Get MF public key for token encryption
    const pubKeyRes = await fetch(`${baseUrl}/security/public-key-certificates`);
    if (!pubKeyRes.ok) {
      return { error: `KSeF public key fetch failed: ${pubKeyRes.status}`, transient: true };
    }
    const pubKeyData = await pubKeyRes.json() as { certificates: { certificate: string; usage: string }[] };
    const tokenCert = pubKeyData.certificates?.find(
      (c) => c.usage?.includes('token') && !c.usage.includes('symmetric'),
    );
    if (!tokenCert) {
      return { error: 'KSeF token encryption certificate not found', transient: false };
    }
    const pubKeyPem = `-----BEGIN CERTIFICATE-----\n${tokenCert.certificate}\n-----END CERTIFICATE-----`;
    const pubKey = crypto.createPublicKey(pubKeyPem);

    // 3. Encrypt token
    const tokenPayload = `${credentials.token}|${challenge.timestampMs}`;
    const encrypted = crypto.publicEncrypt(
      { key: pubKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(tokenPayload, 'utf-8'),
    );
    const encryptedToken = encrypted.toString('base64');

    // 4. Initiate token auth
    const initRes = await fetch(`${baseUrl}/auth/ksef-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge,
        contextIdentifier: { type: 'nip', value: companyNip },
        encryptedToken,
      }),
    });
    if (!initRes.ok) {
      const errBody = await initRes.text().catch(() => '');
      return { error: `KSeF auth init failed: ${initRes.status} ${errBody}`, transient: true };
    }
    const initResult = await initRes.json() as { referenceNumber: string; authenticationToken: string };

    // 5. Poll auth status
    let authToken: string | null = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const statusRes = await fetch(`${baseUrl}/auth/${initResult.referenceNumber}`, {
        headers: { Authorization: `Bearer ${initResult.authenticationToken}` },
      });
      if (statusRes.status === 200) {
        authToken = initResult.authenticationToken;
        break;
      }
      if (statusRes.status !== 100 && !statusRes.ok) {
        return { error: `KSeF auth polling failed: ${statusRes.status}`, transient: true };
      }
    }
    if (!authToken) {
      return { error: 'KSeF auth polling timed out', transient: true };
    }

    // 6. Redeem access token
    const redeemRes = await fetch(`${baseUrl}/auth/token/redeem`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    });
    if (!redeemRes.ok) {
      return { error: `KSeF token redeem failed: ${redeemRes.status}`, transient: true };
    }
    const redeemResult = await redeemRes.json() as { accessToken: string };

    return { accessToken: redeemResult.accessToken, baseUrl };
  } catch (err) {
    return { error: `KSeF auth error: ${(err as Error).message}`, transient: true };
  }
}

/**
 * Submit a signed FA(2) XML invoice to KSeF.
 *
 * This is the main entry point for KSeF submission. It:
 * 1. Gets KSeF credentials for the company
 * 2. Authenticates with KSeF using the token-auth flow
 * 3. POSTs the signed XML to /v2/invoices/send
 * 4. Returns the result with KSeF number and status
 *
 * Idempotent: if the invoice already has a ksef_number, returns it without re-submitting.
 */
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

  // Step 1: Get access token
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

  // Step 2: Submit the invoice XML
  try {
    const sendRes = await fetch(`${baseUrl}/invoices/send`, {
      method: 'POST',
      headers: {
        Authorization:   `Bearer ${accessToken}`,
        'Content-Type':  'application/octet-stream',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: Buffer.from(signedXml, 'utf-8'),
    });

    const responseBody = await sendRes.json().catch(() => ({})) as Record<string, unknown>;

    if (sendRes.ok || sendRes.status === 201) {
      // Success — KSeF accepted the invoice
      const ksefNumber = (responseBody.ksefReferenceNumber ?? responseBody.elementReferenceNumber ?? responseBody.ksefNumber) as string | undefined;
      const submissionId = (responseBody.submissionId ?? responseBody.referenceNumber ?? responseBody.sessionId) as string | undefined;

      return {
        success:       true,
        ksefNumber,
        submissionId,
        status:        'submitted',
        response:      responseBody,
        transient:     false,
      };
    }

    // KSeF rejected the invoice (validation error)
    if (sendRes.status === 400 || sendRes.status === 422) {
      return {
        success:   false,
        status:    'rejected',
        response:  responseBody,
        error:     (responseBody.message ?? responseBody.error ?? 'KSeF rejected the invoice') as string,
        transient: false,
      };
    }

    // Transient error (5xx, 429, etc.) — can retry
    return {
      success:   false,
      status:    'queued',
      response:  responseBody,
      error:     `KSeF send failed: HTTP ${sendRes.status}`,
      transient: true,
    };
  } catch (err) {
    return {
      success:   false,
      status:    'queued',
      response:  { error: (err as Error).message },
      error:     `KSeF send error: ${(err as Error).message}`,
      transient: true,
    };
  }
}

/**
 * Check KSeF submission status by querying KSeF.
 * Used when we have a submission ID but no final KSeF number yet.
 */
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

  try {
    const statusRes = await fetch(`${baseUrl}/invoices/status/${params.submissionId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const responseBody = await statusRes.json().catch(() => ({})) as Record<string, unknown>;

    if (statusRes.ok) {
      const processingCode = (responseBody.processingCode ?? responseBody.status) as number | string | undefined;
      const ksefNumber = (responseBody.ksefReferenceNumber ?? responseBody.ksefNumber) as string | undefined;

      if (processingCode === 200 || processingCode === 'accepted' || ksefNumber) {
        return {
          success:     true,
          ksefNumber,
          submissionId: params.submissionId,
          status:      'accepted',
          response:    responseBody,
          transient:   false,
        };
      }

      if (processingCode === 400 || processingCode === 'rejected') {
        return {
          success:   false,
          status:    'rejected',
          response:  responseBody,
          error:     (responseBody.message ?? 'KSeF rejected the invoice') as string,
          transient: false,
        };
      }

      // Still processing
      return {
        success:   false,
        status:    'submitted',
        response:  responseBody,
        transient: true,
      };
    }

    return {
      success:   false,
      status:    'queued',
      response:  responseBody,
      error:     `Status check failed: HTTP ${statusRes.status}`,
      transient: true,
    };
  } catch (err) {
    return {
      success:   false,
      status:    'queued',
      response:  { error: (err as Error).message },
      error:     `Status check error: ${(err as Error).message}`,
      transient: true,
    };
  }
}

// Re-export for convenience
import * as crypto from 'node:crypto';
