import { NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { logBilling, generateRequestId, errorResponse } from '@/lib/billing/logger';

export const dynamic = 'force-dynamic';

const ALLOWED_UPGRADE_ROLES = ['owner', 'accountant'] as const;

export async function POST() {
  const requestId = generateRequestId();

  try {
    // ── 1. Auth & session extraction (inline, same pattern as billing/status) ──
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logBilling('warn', 'auth failed', { requestId }, authError);
      return errorResponse('Unauthorized', 'UNAUTHORIZED', 401, requestId);
    }

    const { data: userRow, error: rowError } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (rowError) {
      logBilling('error', 'users table query failed', { requestId, userId: user.id }, rowError);
      return errorResponse('Database error', 'DB_ERROR', 500, requestId);
    }

    if (!userRow) {
      logBilling('warn', 'no users row for uid', { requestId, userId: user.id });
      return errorResponse('User record not found', 'USER_NOT_FOUND', 404, requestId);
    }

    const userId = user.id;
    const role = userRow.role ?? 'accountant';
    const companyId: string | null = userRow.company_id ?? null;

    const ctx = { requestId, userId, companyId };

    logBilling('info', 'upgrade request received', ctx);

    // ── 2. Validate company id exists ──────────────────────────────────────────
    if (!companyId) {
      logBilling('warn', 'company id missing in session', ctx);
      return errorResponse('Company id missing in session', 'COMPANY_ID_MISSING', 400, requestId);
    }

    // ── 3. Permission check (role-based) ──────────────────────────────────────
    if (!ALLOWED_UPGRADE_ROLES.includes(role as (typeof ALLOWED_UPGRADE_ROLES)[number])) {
      logBilling('warn', 'forbidden upgrade attempt', { ...ctx, role });
      return errorResponse('Insufficient role to upgrade', 'FORBIDDEN', 403, requestId);
    }

    // ── 4. Company lookup via service-role client ──────────────────────────────
    const admin = getSupabaseServiceClient();

    const { data: company, error: companyError } = await admin
      .from('companies')
      .select('product_type, package_type')
      .eq('id', companyId)
      .maybeSingle();

    if (companyError) {
      logBilling('error', 'db error on company lookup', ctx, companyError);
      return errorResponse('Database error', 'DB_ERROR', 500, requestId);
    }

    if (!company) {
      logBilling('warn', 'company not found', ctx);
      return errorResponse('Company not found', 'COMPANY_NOT_FOUND', 404, requestId);
    }

    logBilling('info', 'company lookup successful', { ...ctx, productType: company.product_type });

    // ── 5. Validate current package is upgradeable ─────────────────────────────
    const currentType = (company.product_type ?? 'starter') as string;

    if (currentType === 'professional') {
      logBilling('info', 'already on professional plan', ctx);
      return errorResponse('Already on Professional plan', 'ALREADY_PROFESSIONAL', 409, requestId);
    }

    if (currentType !== 'starter') {
      logBilling('warn', 'cannot upgrade from current plan', { ...ctx, productType: currentType });
      return errorResponse('Cannot upgrade from current plan', 'INVALID_CURRENT_PLAN', 422, requestId);
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
      .eq('id', companyId);

    if (upgradeError) {
      logBilling('error', 'failed to update company package', ctx, upgradeError);
      return errorResponse('Failed to upgrade plan', 'UPGRADE_FAILED', 500, requestId);
    }

    logBilling('info', 'package updated successfully', ctx);

    // ── 7. Audit logs ──────────────────────────────────────────────────────────
    const auditResults = await Promise.allSettled([
      admin.from('billing_audit').insert({
        company_id: companyId,
        actor_id: userId,
        old_package: 'starter',
        new_package: 'professional',
        provider: 'internal',
        provider_tx_id: null,
        created_at: nowIso,
      }),
      admin.from('company_package_audit').insert({
        company_id: companyId,
        changed_by: userId,
        previous: { product_type: 'starter', package_type: company.package_type ?? 'starter' },
        next: { product_type: 'professional', package_type: 'professional' },
        reason: 'self_serve_upgrade',
        created_at: nowIso,
      }),
    ]);

    const auditFailures = auditResults.filter((r) => r.status === 'rejected');
    if (auditFailures.length > 0) {
      logBilling('warn', 'audit log partially failed', ctx, (auditFailures[0] as PromiseRejectedResult).reason);
    } else {
      logBilling('info', 'audit logs written', ctx);
    }

    // ── 8. Success ─────────────────────────────────────────────────────────────
    logBilling('info', 'upgrade successful', ctx);

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
