import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logBilling, generateRequestId, errorResponse } from '@/lib/billing/logger';

export const dynamic = 'force-dynamic';

export async function POST() {
  const requestId = generateRequestId();

  try {
    // ── 1. Auth & session extraction ──────────────────────────────────────────
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logBilling('warn', 'auth failed', { requestId }, authError);
      return errorResponse('Unauthorized', 'UNAUTHORIZED', 401, requestId);
    }

    const ctx = { requestId, userId: user.id };
    logBilling('info', 'upgrade request received', ctx);

    // ── 2. Call the SECURITY DEFINER function (handles all validation) ──────────
    const { data: result, error: rpcError } = await supabase.rpc('self_serve_upgrade');

    if (rpcError) {
      logBilling('error', 'rpc error on self_serve_upgrade', ctx, rpcError);
      return errorResponse('Database error', 'DB_ERROR', 500, requestId);
    }

    const res = result as unknown as Record<string, unknown> | null;
    if (!res) {
      logBilling('error', 'empty response from self_serve_upgrade', ctx);
      return errorResponse('Database error', 'DB_ERROR', 500, requestId);
    }

    const ok = res.ok as boolean;
    const code = (res.code as string) ?? 'INTERNAL_ERROR';
    const message = (res.message as string) ?? 'Internal server error';

    if (!ok) {
      // Map the function's error code to HTTP status
      const statusMap: Record<string, number> = {
        UNAUTHORIZED: 401,
        USER_NOT_FOUND: 404,
        COMPANY_ID_MISSING: 400,
        FORBIDDEN: 403,
        COMPANY_NOT_FOUND: 404,
        ALREADY_PROFESSIONAL: 409,
        INVALID_CURRENT_PLAN: 422,
        INTERNAL_ERROR: 500,
      };
      const status = statusMap[code] ?? 500;

      logBilling(
        status >= 500 ? 'error' : 'warn',
        `upgrade rejected: ${code}`,
        { ...ctx, code },
      );
      return errorResponse(message, code, status, requestId);
    }

    // ── 3. Success ─────────────────────────────────────────────────────────────
    logBilling('info', 'upgrade successful', { ...ctx, productType: res.product_type });
    return NextResponse.json({
      product_type: 'professional',
      message: 'Plan upgraded to Professional',
      requestId,
    });
  } catch (err) {
    logBilling('error', 'unexpected error in billing/upgrade', { requestId }, err);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500, requestId);
  }
}
