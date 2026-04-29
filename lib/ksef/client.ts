import { encryptTokenForKSeF } from './crypto';
import { getInvoiceMetadata as parseXML } from './parser';
import {
  KSeFError,
  KSeFNetworkError,
  KSeFSessionInitError,
  KSeFSessionTimeoutError,
  KSeFNotFoundError,
  classifyHttpError,
} from './errors';
import type {
  KSeFSession,
  KSeFInitTokenResponse,
  KSeFSessionStatusResponse,
  KSeFInvoiceHeader,
  KSeFInvoiceListResponse,
  KSeFFilteredListRequest,
  KSeFInvoiceMetadata,
} from './types';

const DEFAULT_BASE_URL =
  process.env.KSEF_API_BASE_URL ?? 'https://ksef.mf.gov.pl/api/v2';

const SESSION_POLL_INTERVAL_MS = 1_000;
const SESSION_POLL_MAX_ATTEMPTS = 20;
const SESSION_TTL_MS = 55 * 60 * 1_000;
const REQUEST_TIMEOUT_MS = 30_000;

async function ksefFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('abort') || msg.includes('timeout')) {
      throw new KSeFNetworkError(`Request to ${url} timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw new KSeFNetworkError(msg);
  } finally {
    clearTimeout(timer);
  }
}

async function assertOk(res: Response): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => '');
  throw classifyHttpError(res.status, body);
}

async function pollForSession(
  referenceNumber: string,
  baseUrl: string
): Promise<string> {
  for (let attempt = 0; attempt < SESSION_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, SESSION_POLL_INTERVAL_MS));

    const res = await ksefFetch(
      `${baseUrl}/online/Auth/Status/${referenceNumber}`,
      { method: 'GET' }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw classifyHttpError(res.status, body);
    }

    const data = (await res.json()) as KSeFSessionStatusResponse;

    if (data.sessionToken?.token) {
      return data.sessionToken.token;
    }

    const code = data.processingCode;
    if (code === 401 || code === 403) {
      throw new KSeFSessionInitError(data.processingDescription);
    }
  }

  throw new KSeFSessionTimeoutError();
}

async function terminateSession(
  sessionToken: string,
  baseUrl: string
): Promise<void> {
  try {
    await ksefFetch(`${baseUrl}/online/Auth/Terminate`, {
      method: 'GET',
      headers: { SessionToken: sessionToken },
    });
  } catch {
  }
}

export async function authenticateWithToken(
  token: string,
  nip: string,
  baseUrl: string = DEFAULT_BASE_URL
): Promise<KSeFSession> {
  if (!token?.trim()) {
    throw new KSeFError('Token must not be empty', 'INVALID_TOKEN');
  }
  if (!nip?.trim()) {
    throw new KSeFError('NIP must not be empty', 'INVALID_TOKEN');
  }

  const encryptedToken = await encryptTokenForKSeF(token, baseUrl);

  const res = await ksefFetch(`${baseUrl}/online/Auth/InitToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contextIdentifier: {
        type: 'onip',
        identifier: nip.replace(/[^0-9]/g, ''),
      },
      token: encryptedToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw classifyHttpError(res.status, body);
  }

  const initData = (await res.json()) as KSeFInitTokenResponse;

  if (!initData?.referenceNumber) {
    throw new KSeFSessionInitError('InitToken response missing referenceNumber');
  }

  const sessionToken = await pollForSession(initData.referenceNumber, baseUrl);

  return {
    sessionToken,
    referenceNumber: initData.referenceNumber,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  };
}

export async function listInvoices(
  token: string,
  fromDate: string,
  toDate: string,
  nip: string,
  options: {
    baseUrl?: string;
    subjectType?: 'subject1' | 'subject2' | 'subject3';
    pageSize?: number;
    pageOffset?: number;
  } = {}
): Promise<KSeFInvoiceHeader[]> {
  const {
    baseUrl = DEFAULT_BASE_URL,
    subjectType = 'subject1',
    pageSize = 100,
    pageOffset = 0,
  } = options;

  const { sessionToken } = await authenticateWithToken(token, nip, baseUrl);

  try {
    const body: KSeFFilteredListRequest = {
      invoiceHeaderList: {
        subjectType,
        invoiceDateFrom: `${fromDate}T00:00:00`,
        invoiceDateTo: `${toDate}T23:59:59`,
      },
    };

    const res = await ksefFetch(
      `${baseUrl}/online/Invoice/GetFilteredList?PageSize=${pageSize}&PageOffset=${pageOffset}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          SessionToken: sessionToken,
        },
        body: JSON.stringify(body),
      }
    );

    await assertOk(res);

    const data = (await res.json()) as KSeFInvoiceListResponse;
    return data.invoiceHeaderList ?? [];
  } finally {
    await terminateSession(sessionToken, baseUrl);
  }
}

export async function downloadInvoiceXML(
  token: string,
  referenceNumber: string,
  nip: string,
  baseUrl: string = DEFAULT_BASE_URL
): Promise<string> {
  if (!referenceNumber?.trim()) {
    throw new KSeFError('referenceNumber must not be empty', 'NOT_FOUND');
  }

  const { sessionToken } = await authenticateWithToken(token, nip, baseUrl);

  try {
    const res = await ksefFetch(
      `${baseUrl}/online/Invoice/Get/${encodeURIComponent(referenceNumber.trim())}`,
      {
        method: 'GET',
        headers: { SessionToken: sessionToken },
      }
    );

    if (res.status === 404) {
      throw new KSeFNotFoundError(referenceNumber);
    }

    await assertOk(res);

    const contentType = res.headers.get('content-type') ?? '';

    if (contentType.includes('zip') || contentType.includes('octet-stream')) {
      const buffer = await res.arrayBuffer();
      return await extractXMLFromZip(buffer);
    }

    return await res.text();
  } finally {
    await terminateSession(sessionToken, baseUrl);
  }
}

async function extractXMLFromZip(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const PK_SIG = [0x50, 0x4b, 0x03, 0x04];
  const isZip = PK_SIG.every((b, i) => bytes[i] === b);

  if (!isZip) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  const text = new TextDecoder('latin1').decode(bytes);
  const xmlStart = text.indexOf('<?xml');
  const xmlAlt = text.indexOf('<Faktura');

  const start = xmlStart !== -1 ? xmlStart : xmlAlt;
  if (start === -1) {
    throw new KSeFError(
      'Could not locate XML content inside the ZIP archive returned by KSeF',
      'PARSE_ERROR'
    );
  }

  return new TextDecoder('utf-8').decode(bytes.slice(start));
}

export function getInvoiceMetadata(xml: string): KSeFInvoiceMetadata {
  return parseXML(xml);
}

export class KSeFClient {
  private readonly token: string;
  private readonly nip: string;
  private readonly baseUrl: string;

  constructor(config: {
    token: string;
    nip: string;
    baseUrl?: string;
  }) {
    if (!config.token?.trim()) throw new KSeFError('token is required', 'INVALID_TOKEN');
    if (!config.nip?.trim()) throw new KSeFError('nip is required', 'INVALID_TOKEN');
    this.token = config.token;
    this.nip = config.nip;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  async authenticateWithToken(): Promise<KSeFSession> {
    return authenticateWithToken(this.token, this.nip, this.baseUrl);
  }

  async listInvoices(
    fromDate: string,
    toDate: string,
    options: {
      subjectType?: 'subject1' | 'subject2' | 'subject3';
      pageSize?: number;
      pageOffset?: number;
    } = {}
  ): Promise<KSeFInvoiceHeader[]> {
    return listInvoices(this.token, fromDate, toDate, this.nip, {
      baseUrl: this.baseUrl,
      ...options,
    });
  }

  async downloadInvoiceXML(referenceNumber: string): Promise<string> {
    return downloadInvoiceXML(this.token, referenceNumber, this.nip, this.baseUrl);
  }

  getInvoiceMetadata(xml: string): KSeFInvoiceMetadata {
    return parseXML(xml);
  }
}
