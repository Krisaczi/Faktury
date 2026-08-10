import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, AuthError } from '@/lib/auth/get-authenticated-user';
import { logBilling, generateRequestId, errorResponse } from '@/lib/billing/logger';
import type { Database } from '@/types/database';

export const dynamic = 'force-dynamic';

interface CompanyPackageRow {
  product_type: string | null;
  package_type: string | null;
}

const ALLOWED_UPGRADE_ROLES = ['owner', 'accountant'] as const;

export async function POST() {
  const requestId = generateRequestId();

  try {
    // ── 1. Auth & session extraction ──────────────────────────────────────────
    let user;
    try {
      user = await getAuthenticatedUser();
    } catch (err) {
      if (err instanceof AuthError) {
        logBilling('warn', 'auth failed', { requestId }, err);
        return errorResponse(err.message, err.code, err.status, requestId);
      }
      throw err;
    }

    const ctx = { requestId, userId: user.userId, companyId: user.companyId };
    logBilling('info', 'upgrade request received', ctx);

    // ── 2. Validate company id exists in session ──────────────────────────────
    if (!user.companyId) {
      logBilling('warn', 'company id missing in session', ctx);
      return errorResponse(
        'Company id missing in session',
        'COMPANY_ID_MISSING',
        400,
        requestId,
      );
    }

    // ── 3. Permission check (role-based) ──────────────────────────────────────
    if (!ALLOWED_UPGRADE_ROLES.includes(user.role as (typeof ALLOWED_UPGRADE_ROLES)[number])) {
      logBilling('warn', 'forbidden upgrade attempt — insufficient role', { ...ctx, role: user.role });
      return errorResponse(
        'Insufficient role to upgrade',
        'FORBIDDEN',
        403,
        requestId,
      );
    }

    // ── 4. Company lookup via service-role client (bypasses RLS) ───────────────
    // The service-role client is used here because the companies UPDATE policy
    // restricts writes to 'owner' only, but accountants are also allowed to
    // trigger upgrades. The read and write both go through the service client.
    const admin = getSupabaseServiceClient();

    const { data: company, error: companyError } = await admin
      .from('companies')
      .select('product_type, package_type')
      .eq('id', user.companyId)
      .maybeSingle<CompanyPackageRow>();

    if (companyError) {
      logBilling('error', 'db error on company lookup', ctx, companyError);
      return errorResponse(
        'Database error',
        'DB_ERROR',
        500,
        requestId,
      );
    }

    if (!company) {
      logBilling('warn', 'company not found', ctx);
      return errorResponse(
        'Company not found',
        'COMPANY_NOT_FOUND',
        404,
        requestId,
      );
    }

    logBilling('info', 'company lookup successful', { ...ctx, productType: company.product_type });

    // ── 5. Validate current package is upgradeable ─────────────────────────────
    const currentType = (company.product_type ?? 'starter') as string;

    if (currentType === 'professional') {
      logBilling('info', 'already on professional plan', ctx);
      return errorResponse(
        'Already on Professional plan',
        'ALREADY_PROFESSIONAL',
        409,
        requestId,
      );
    }

    if (currentType !== 'starter') {
      logBilling('warn', 'cannot upgrade from current plan', { ...ctx, productType: currentType });
      return errorResponse(
        'Cannot upgrade from current plan',
        'INVALID_CURRENT_PLAN',
        422,
        requestId,
      );
    }

    // ── 6. Perform upgrade via service-role client ─────────────────────────────
    const nowIso = new Date().toISOString();

    const { error: upgradeError } = await admin
      .from('companies')
      .update({
        product_type: 'professional',
        package_type: 'professional',
        subscription_status: 'active',
        package_changed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', user.companyId);

    if (upgradeError) {
      logBilling('error', 'failed to update company package', ctx, upgradeError);
      return errorResponse(
        'Failed to upgrade plan',
        'UPGRADE_FAILED',
        500,
        requestId,
      );
    }

    logBilling('info', 'package updated successfully', ctx);

    // ── 7. Audit logs (billing_audit + company_package_audit) ───────────────────
    const auditInserts = [
      admin.from('billing_audit').insert({
        company_id: user.companyId,
        actor_id: user.userId,
        old_package: 'starter',
        new_package: 'professional',
        provider: 'internal',
        provider_tx_id: null,
        created_at: nowIso,
      }),
      admin.from('company_package_audit').insert({
        company_id: user.companyId,
        changed_by: user.userId,
        previous: { product_type: 'starter', package_type: company.package_type ?? 'starter' },
        next: { product_type: 'professional', package_type: 'professional' },
        reason: 'self_serve_upgrade',
        created_at: nowIso,
      }),
    ];

    const auditResults = await Promise.allSettled(auditInserts);
    const auditFailures = auditResults.filter((r) => r.status === 'rejected');
    if (auditFailures.length > 0) {
      logBilling('warn', 'audit log partially failed', ctx, (auditFailures[0] as PromiseRejectedResult).reason);
    } else {
      logBilling('info', 'audit logs written', ctx);
    }

    // ── 8. Success response ────────────────────────────────────────────────────
    logBilling('info', 'upgrade successful', ctx);

    return NextResponse.json({
      product_type: 'professional',
      message: 'Plan upgraded to Professional',
      requestId,
    });
  } catch (err) {
    logBilling('error', 'unexpected error in billing/upgrade', { requestId }, err);
    return errorResponse(
      'Internal server error',
      'INTERNAL_ERROR',
      500,
      requestId,
    );
  }
}
