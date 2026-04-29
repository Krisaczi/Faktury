export type KSeFErrorCode =
  | 'INVALID_TOKEN'
  | 'EXPIRED_TOKEN'
  | 'RATE_LIMIT'
  | 'NOT_FOUND'
  | 'SESSION_INIT_FAILED'
  | 'SESSION_TIMEOUT'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'ENCRYPTION_ERROR'
  | 'API_ERROR';

export class KSeFError extends Error {
  readonly code: KSeFErrorCode;
  readonly status?: number;
  readonly detail?: string;

  constructor(message: string, code: KSeFErrorCode, status?: number, detail?: string) {
    super(message);
    this.name = 'KSeFError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export class KSeFInvalidTokenError extends KSeFError {
  constructor(detail?: string) {
    super(
      'The provided KSeF token is invalid. Please verify the token in your KSeF portal.',
      'INVALID_TOKEN',
      401,
      detail
    );
    this.name = 'KSeFInvalidTokenError';
  }
}

export class KSeFExpiredTokenError extends KSeFError {
  constructor(detail?: string) {
    super(
      'The KSeF token has expired (tokens are valid for 1 year). Please generate a new token in the KSeF portal.',
      'EXPIRED_TOKEN',
      401,
      detail
    );
    this.name = 'KSeFExpiredTokenError';
  }
}

export class KSeFRateLimitError extends KSeFError {
  readonly retryAfterMs: number;

  constructor(retryAfterMs = 60_000, detail?: string) {
    super(
      `KSeF API rate limit exceeded. Retry after ${Math.ceil(retryAfterMs / 1000)} seconds.`,
      'RATE_LIMIT',
      429,
      detail
    );
    this.name = 'KSeFRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class KSeFNotFoundError extends KSeFError {
  constructor(referenceNumber: string) {
    super(
      `Invoice with reference number "${referenceNumber}" was not found in KSeF.`,
      'NOT_FOUND',
      404
    );
    this.name = 'KSeFNotFoundError';
  }
}

export class KSeFSessionInitError extends KSeFError {
  constructor(detail?: string) {
    super(
      'Failed to initialize a KSeF session. Check that the token and NIP are correct.',
      'SESSION_INIT_FAILED',
      undefined,
      detail
    );
    this.name = 'KSeFSessionInitError';
  }
}

export class KSeFSessionTimeoutError extends KSeFError {
  constructor() {
    super(
      'KSeF session authorization timed out after waiting for the session to become active.',
      'SESSION_TIMEOUT'
    );
    this.name = 'KSeFSessionTimeoutError';
  }
}

export class KSeFNetworkError extends KSeFError {
  constructor(detail?: string) {
    super(
      'Could not reach the KSeF API. Check your network connection or try again later.',
      'NETWORK_ERROR',
      undefined,
      detail
    );
    this.name = 'KSeFNetworkError';
  }
}

export class KSeFEncryptionError extends KSeFError {
  constructor(detail?: string) {
    super(
      'Failed to encrypt the token for KSeF authentication.',
      'ENCRYPTION_ERROR',
      undefined,
      detail
    );
    this.name = 'KSeFEncryptionError';
  }
}

export function classifyHttpError(status: number, body: string): KSeFError {
  if (status === 401) {
    const lower = body.toLowerCase();
    if (lower.includes('expir') || lower.includes('wygasł') || lower.includes('wygasl')) {
      return new KSeFExpiredTokenError(body);
    }
    return new KSeFInvalidTokenError(body);
  }
  if (status === 429) {
    return new KSeFRateLimitError(60_000, body);
  }
  if (status === 404) {
    return new KSeFError('Resource not found', 'NOT_FOUND', 404, body);
  }
  return new KSeFError(
    `KSeF API returned HTTP ${status}`,
    'API_ERROR',
    status,
    body
  );
}
