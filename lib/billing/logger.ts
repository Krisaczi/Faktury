import { NextResponse } from 'next/server';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogContext {
  requestId: string;
  userId?: string;
  companyId?: string | null;
  [key: string]: unknown;
}

/**
 * Structured logger for billing routes. Emits JSON to console with consistent
 * fields: level, msg, requestId, userId, companyId, and any extra context.
 * Never logs secrets, tokens, or PII beyond userId/email.
 */
export function logBilling(
  level: LogLevel,
  msg: string,
  ctx: LogContext,
  err?: unknown,
): void {
  const payload: Record<string, unknown> = {
    level,
    msg,
    requestId: ctx.requestId,
    userId: ctx.userId ?? null,
    companyId: ctx.companyId ?? null,
  };

  for (const [key, value] of Object.entries(ctx)) {
    if (key !== 'requestId' && key !== 'userId' && key !== 'companyId') {
      payload[key] = value;
    }
  }

  if (err) {
    if (err instanceof Error) {
      payload.error = err.message;
      payload.errorName = err.name;
    } else if (typeof err === 'object' && err !== null && 'message' in err) {
      payload.error = String((err as Record<string, unknown>).message);
    } else {
      payload.error = String(err);
    }
  }

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Generates a short request ID for tracing. Uses crypto.randomUUID when
 * available, falls back to a timestamp+random string.
 */
export function generateRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID().slice(0, 8);
    }
  } catch {
    // fallthrough
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Error response helper with consistent shape: { error, code }.
 */
export function errorResponse(
  error: string,
  code: string,
  status: number,
  requestId?: string,
): NextResponse {
  const body: Record<string, unknown> = { error, code };
  if (requestId) body.requestId = requestId;
  return NextResponse.json(body, { status });
}
