/**
 * Structured parser for KSeF rejection responses.
 *
 * KSeF 2.0 returns rejection information in various shapes depending on
 * where in the pipeline the failure occurred:
 *
 * 1. HTTP-level rejection (sendInvoiceInSession returns 400/422):
 *    { message, error, processingCode, processingDescription, ... }
 *
 * 2. Session-level rejection (session status 4xx after close):
 *    { sessionCode, sessionDescription, processingCode, processingDescription,
 *      failedInvoices: [{ ... }] }
 *
 * 3. Per-invoice validation errors from the failed-invoices endpoint:
 *    Each failed invoice may contain `validationErrors` or `errors` arrays
 *    with XPath, element, and message details.
 *
 * This module normalises all those shapes into a single `KsefRejectionDetails`
 * structure that the UI can render without inspecting raw JSON.
 */

export interface KsefValidationError {
  xpath?: string;
  element?: string;
  message?: string;
  errorCode?: string;
  expectedValue?: string;
  actualValue?: string;
}

export interface KsefRejectionDetails {
  rejected: boolean;
  status: string;
  referenceNumber: string | null;
  processingCode: number | null;
  processingDescription: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorPath: string | null;
  validationErrors: KsefValidationError[];
  rawResponse: Record<string, unknown> | null;
  rejectionStage: 'send' | 'session' | 'auth' | 'unknown';
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim() !== '') return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

function pickNum(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10);
    if (isObject(v)) {
      const code = pickNum(v, 'code', 'processingCode');
      if (code != null) return code;
    }
  }
  return null;
}

/**
 * Extract validation errors from a KSeF failed-invoice object.
 * KSeF may use `validationErrors`, `errors`, `processingErrors`, or
 * `errorDetails` arrays. Each entry may have different field names.
 */
function extractValidationErrors(invoice: Record<string, unknown>): KsefValidationError[] {
  const rawArrays = [
    invoice.validationErrors,
    invoice.errors,
    invoice.processingErrors,
    invoice.errorDetails,
  ].filter(Array.isArray) as unknown[][];

  const results: KsefValidationError[] = [];

  for (const arr of rawArrays) {
    for (const entry of arr) {
      if (isObject(entry)) {
        results.push({
          xpath: pickStr(entry, 'xpath', 'path', 'elementPath', 'location') ?? undefined,
          element: pickStr(entry, 'element', 'elementName', 'field') ?? undefined,
          message: pickStr(entry, 'message', 'description', 'detail', 'errorDescription') ?? undefined,
          errorCode: pickStr(entry, 'errorCode', 'code', 'errorId', 'processingCode') ?? undefined,
          expectedValue: pickStr(entry, 'expectedValue', 'expected', 'expectedContent') ?? undefined,
          actualValue: pickStr(entry, 'actualValue', 'actual', 'providedValue', 'value') ?? undefined,
        });
      } else if (typeof entry === 'string') {
        results.push({ message: entry });
      }
    }
  }

  return results;
}

/**
 * Parse a raw KSeF response object into a structured rejection summary.
 *
 * Returns `rejected: false` if the response doesn't look like a rejection.
 */
export function parseKsefRejection(
  response: Record<string, unknown> | null | undefined,
  ksefStatus: string | null | undefined,
): KsefRejectionDetails {
  if (!response || !isObject(response)) {
    return {
      rejected: false,
      status: ksefStatus ?? 'unknown',
      referenceNumber: null,
      processingCode: null,
      processingDescription: null,
      errorCode: null,
      errorMessage: null,
      errorPath: null,
      validationErrors: [],
      rawResponse: response ?? null,
      rejectionStage: 'unknown',
    };
  }

  // Determine if this is a rejection
  const status = ksefStatus ?? pickStr(response, 'status', 'ksefStatus') ?? 'unknown';
  const isRejected =
    status === 'rejected' ||
    status === 'failed' ||
    !!response.error ||
    !!response.errorMessage ||
    pickNum(response, 'processingCode', 'sessionCode') != null &&
    (pickNum(response, 'processingCode', 'sessionCode') ?? 0) >= 400;

  if (!isRejected) {
    return {
      rejected: false,
      status,
      referenceNumber: pickStr(response, 'referenceNumber', 'ksefReferenceNumber', 'ksefNumber', 'elementReferenceNumber'),
      processingCode: pickNum(response, 'processingCode'),
      processingDescription: pickStr(response, 'processingDescription', 'description'),
      errorCode: null,
      errorMessage: null,
      errorPath: null,
      validationErrors: [],
      rawResponse: response,
      rejectionStage: 'unknown',
    };
  }

  // ── Determine rejection stage ──
  let stage: KsefRejectionDetails['rejectionStage'] = 'unknown';
  if (response.error && (response.error as string).toLowerCase().includes('auth')) {
    stage = 'auth';
  } else if (response.failedInvoices || response.sessionCode != null || response.sessionDescription != null) {
    stage = 'session';
  } else if (response.message || response.error) {
    stage = 'send';
  }

  // ── Collect validation errors from all possible locations ──
  const validationErrors: KsefValidationError[] = [];

  // Top-level validation errors
  validationErrors.push(...extractValidationErrors(response));

  // Errors from failedInvoices array
  const failedInvoices = response.failedInvoices;
  if (Array.isArray(failedInvoices)) {
    for (const fi of failedInvoices) {
      if (isObject(fi)) {
        validationErrors.push(...extractValidationErrors(fi));
      }
    }
  }

  // Errors from sessionInvoices array (may contain rejected entries)
  const sessionInvoices = response.sessionInvoices;
  if (Array.isArray(sessionInvoices)) {
    for (const si of sessionInvoices) {
      if (isObject(si)) {
        const procCode = pickNum(si, 'processingCode');
        if (procCode != null && procCode >= 400) {
          validationErrors.push(...extractValidationErrors(si));
        }
      }
    }
  }

  // Nested `status` object
  const statusObj = response.status;
  if (isObject(statusObj)) {
    const code = pickNum(statusObj, 'code');
    if (code != null && code >= 400) {
      const msg = pickStr(statusObj, 'description', 'message');
      if (msg) {
        validationErrors.push({ message: msg, errorCode: String(code) });
      }
    }
  }

  // ── Extract primary error info ──
  const firstError = validationErrors[0];

  const errorMessage =
    pickStr(response, 'error', 'errorMessage', 'message', 'processingDescription') ??
    pickStr(response, 'sessionDescription') ??
    firstError?.message ??
    null;

  const errorCode =
    pickStr(response, 'errorCode', 'code', 'processingCode') ??
    firstError?.errorCode ??
    (pickNum(response, 'processingCode', 'sessionCode') != null
      ? String(pickNum(response, 'processingCode', 'sessionCode'))
      : null);

  const errorPath =
    firstError?.xpath ??
    firstError?.element ??
    pickStr(response, 'errorPath', 'xpath', 'path') ??
    null;

  return {
    rejected: true,
    status,
    referenceNumber: pickStr(response, 'referenceNumber', 'ksefReferenceNumber', 'ksefNumber', 'elementReferenceNumber'),
    processingCode: pickNum(response, 'processingCode', 'sessionCode'),
    processingDescription: pickStr(response, 'processingDescription', 'description', 'sessionDescription'),
    errorCode,
    errorMessage,
    errorPath,
    validationErrors,
    rawResponse: response,
    rejectionStage: stage,
  };
}
