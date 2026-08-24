import { getSupabaseServerClient } from '@/lib/supabase/server';
import { normalizePlanId } from './canonical-plan';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ReconciliationEntry {
  userId:        string;
  email:         string;
  companyId:     string | null;
  companyPlan:   string;       // plan in companies.product_type
  canonicalPlan: string;       // the reconciled/correct plan
  mismatch:      boolean;
  recommendedAction: 'noop' | 'fix' | 'flag';
  reason:        string;
}

export interface ReconciliationReport {
  totalUsers:    number;
  mismatched:    number;
  matched:       number;
  entries:       ReconciliationEntry[];
  generatedAt:   string;
}

export interface ReconcileResult {
  ok:            boolean;
  userId:        string;
  fromPlan:      string;
  toPlan:        string;
  action:        'noop' | 'fix' | 'flag' | 'dry_run';
  auditId:       string | null;
  error?:        string;
}

// ─── Generate reconciliation report ─────────────────────────────────────────────

/**
 * Scans all users for plan consistency. Since companies.product_type is now the
 * sole source of truth, this checks for corrupted/inconsistent package_type values.
 */
export async function generateReconciliationReport(): Promise<ReconciliationReport> {
  const supabase = await getSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: users } = await (supabase as any)
    .from('users')
    .select('id, email, company_id, active')
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (!users || users.length === 0) {
    return { totalUsers: 0, mismatched: 0, matched: 0, entries: [], generatedAt: new Date().toISOString() };
  }

  const companyIds = Array.from(new Set(
    users.map((u: { company_id: string | null }) => u.company_id).filter(Boolean)
  )) as string[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companiesRes = companyIds.length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (supabase as any).from('companies').select('id, product_type, package_type').in('id', companyIds)
    : { data: [] };

  const companyMap = new Map(
    ((companiesRes.data ?? []) as { id: string; product_type: string | null; package_type: string | null }[])
      .map((c) => [c.id, c])
  );

  const entries: ReconciliationEntry[] = [];
  let mismatched = 0;
  let matched = 0;

  for (const u of users as { id: string; email: string; company_id: string | null }[]) {
    const company = u.company_id ? companyMap.get(u.company_id) : null;

    const productType = normalizePlanId(company?.product_type ?? 'starter');
    const packageType = normalizePlanId(company?.package_type ?? 'starter');
    const canonicalPlan = productType;

    const hasMismatch = packageType !== canonicalPlan;

    if (hasMismatch) {
      mismatched++;
    } else {
      matched++;
    }

    entries.push({
      userId:        u.id,
      email:         u.email,
      companyId:     u.company_id,
      companyPlan:   packageType,
      canonicalPlan,
      mismatch:      hasMismatch,
      recommendedAction: hasMismatch ? 'fix' : 'noop',
      reason: hasMismatch
        ? `package_type (${packageType}) != product_type (${canonicalPlan}) — wymaga synchronizacji`
        : 'Spójne',
    });
  }

  return {
    totalUsers: entries.length,
    mismatched,
    matched,
    entries,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Reconcile a single user ────────────────────────────────────────────────────

/**
 * Reconciles a single user's plan. Fixes corrupted package_type to match product_type.
 */
export async function reconcileUser(
  ownerId: string,
  targetUserId: string,
  _ownerIp: string | undefined,
  options: { dryRun?: boolean; reason?: string } = {},
): Promise<ReconcileResult> {
  const supabase = await getSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: user, error: userErr } = await (supabase as any)
    .from('users')
    .select('id, email, company_id')
    .eq('id', targetUserId)
    .maybeSingle();

  if (userErr || !user) {
    return { ok: false, userId: targetUserId, fromPlan: '', toPlan: '', action: 'flag', auditId: null, error: 'Użytkownik nie znaleziony.' };
  }

  if (!user.company_id) {
    return { ok: false, userId: targetUserId, fromPlan: '', toPlan: '', action: 'flag', auditId: null, error: 'Użytkownik nie ma firmy.' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('product_type, package_type')
    .eq('id', user.company_id)
    .maybeSingle();

  const productType = normalizePlanId(company?.product_type ?? 'starter');
  const packageType = normalizePlanId(company?.package_type ?? 'starter');

  if (productType === packageType) {
    return {
      ok: true,
      userId: targetUserId,
      fromPlan: packageType,
      toPlan: productType,
      action: 'noop',
      auditId: null,
    };
  }

  if (options.dryRun) {
    return {
      ok: true,
      userId: targetUserId,
      fromPlan: packageType,
      toPlan: productType,
      action: 'dry_run',
      auditId: null,
    };
  }

  // Apply: fix package_type to match product_type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (supabase as any)
    .from('companies')
    .update({ package_type: productType, updated_at: new Date().toISOString() })
    .eq('id', user.company_id);

  if (updateErr) {
    return {
      ok: false,
      userId: targetUserId,
      fromPlan: packageType,
      toPlan: productType,
      action: 'flag',
      auditId: null,
      error: 'Błąd aktualizacji firmy.',
    };
  }

  // Log to plan_change_audit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: auditRow } = await (supabase as any)
    .from('plan_change_audit')
    .insert({
      owner_id:       ownerId,
      target_user_id: targetUserId,
      company_id:     user.company_id,
      from_plan:      packageType,
      to_plan:        productType,
      effective:      'now',
      reason:         options.reason ?? 'Reconciliation — package_type synced to product_type',
      provider:       'local',
    })
    .select('id')
    .maybeSingle();

  return {
    ok: true,
    userId: targetUserId,
    fromPlan: packageType,
    toPlan: productType,
    action: 'fix',
    auditId: auditRow?.id ?? null,
  };
}

// ─── Bulk reconcile ─────────────────────────────────────────────────────────────

export async function reconcileAll(
  ownerId: string,
  ownerIp: string | undefined,
  options: { dryRun?: boolean; reason?: string } = {},
): Promise<{ results: ReconcileResult[]; totalFixed: number; totalNoop: number; totalErrors: number }> {
  const report = await generateReconciliationReport();
  const mismatchedEntries = report.entries.filter((e) => e.mismatch);

  const results: ReconcileResult[] = [];
  let totalFixed = 0;
  let totalNoop = 0;
  let totalErrors = 0;

  for (const entry of mismatchedEntries) {
    const result = await reconcileUser(ownerId, entry.userId, ownerIp, options);
    results.push(result);

    if (result.ok) {
      if (result.action === 'fix') totalFixed++;
      else totalNoop++;
    } else {
      totalErrors++;
    }
  }

  return { results, totalFixed, totalNoop, totalErrors };
}

// ─── Reconcile by emails (batch) ────────────────────────────────────────────────

export async function reconcileBatch(
  ownerId: string,
  ownerIp: string | undefined,
  options: { emails?: string[]; dryRun?: boolean; reason?: string } = {},
): Promise<{ results: ReconcileResult[]; totalFixed: number; totalNoop: number; totalErrors: number; totalScanned: number }> {
  const supabase = await getSupabaseServerClient();

  let targetUserIds: { id: string; email: string }[] = [];

  if (options.emails && options.emails.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: users } = await (supabase as any)
      .from('users')
      .select('id, email')
      .in('email', options.emails)
      .eq('active', true);
    targetUserIds = users ?? [];
  } else {
    const report = await generateReconciliationReport();
    return {
      ...await reconcileAll(ownerId, ownerIp, options),
      totalScanned: report.totalUsers,
    };
  }

  const results: ReconcileResult[] = [];
  let totalFixed = 0;
  let totalNoop = 0;
  let totalErrors = 0;

  for (const u of targetUserIds) {
    const result = await reconcileUser(ownerId, u.id, ownerIp, options);
    results.push(result);
    if (result.ok) {
      if (result.action === 'fix') totalFixed++;
      else totalNoop++;
    } else {
      totalErrors++;
    }
  }

  return { results, totalFixed, totalNoop, totalErrors, totalScanned: targetUserIds.length };
}

// ─── Force set plan ────────────────────────────────────────────────────────────

export interface ForceSetPlanResult {
  ok:        boolean;
  userId:    string;
  fromPlan:  string;
  toPlan:    string;
  auditId:   string | null;
  error?:    string;
}

/**
 * Force-sets a user's plan by updating companies.product_type directly.
 * This is the owner's direct plan assignment tool.
 */
export async function forceSetPlan(
  ownerId: string,
  targetUserId: string,
  planId: string,
  ownerIp: string | undefined,
  options: { reason?: string } = {},
): Promise<ForceSetPlanResult> {
  const supabase = await getSupabaseServerClient();

  const normalizedPlanId = normalizePlanId(planId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: user, error: userErr } = await (supabase as any)
    .from('users')
    .select('id, email, company_id')
    .eq('id', targetUserId)
    .maybeSingle();

  if (userErr || !user) {
    return { ok: false, userId: targetUserId, fromPlan: '', toPlan: normalizedPlanId, auditId: null, error: 'Użytkownik nie znaleziony.' };
  }

  if (!user.company_id) {
    return { ok: false, userId: targetUserId, fromPlan: '', toPlan: normalizedPlanId, auditId: null, error: 'Użytkownik nie ma firmy.' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('product_type')
    .eq('id', user.company_id)
    .maybeSingle();

  const fromPlan = normalizePlanId(company?.product_type ?? 'starter');
  const now = new Date().toISOString();

  // Update companies table — sole source of truth
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (supabase as any)
    .from('companies')
    .update({
      product_type:        normalizedPlanId,
      package_type:        normalizedPlanId,
      package_assigned_at: now,
      updated_at:          now,
    })
    .eq('id', user.company_id);

  if (updateErr) {
    return { ok: false, userId: targetUserId, fromPlan, toPlan: normalizedPlanId, auditId: null, error: 'Błąd ustawiania planu.' };
  }

  // Log to plan_change_audit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: auditRow } = await (supabase as any)
    .from('plan_change_audit')
    .insert({
      owner_id:       ownerId,
      target_user_id: targetUserId,
      company_id:     user.company_id,
      from_plan:      fromPlan,
      to_plan:        normalizedPlanId,
      effective:      'now',
      reason:         options.reason ?? 'Owner force-set plan',
      owner_ip:       ownerIp ?? null,
      provider:       'owner',
    })
    .select('id')
    .maybeSingle();

  // Log to billing_audit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('billing_audit')
    .insert({
      company_id:  user.company_id,
      actor_id:    ownerId,
      old_package: fromPlan,
      new_package: normalizedPlanId,
      provider:    'local',
      event_type:  'plan_changed',
      from_plan:   fromPlan,
      to_plan:     normalizedPlanId,
      changed_by:  ownerId,
      metadata:    { reason: options.reason ?? 'Owner force-set plan', source: 'owner' },
    });

  return {
    ok: true,
    userId: targetUserId,
    fromPlan,
    toPlan: normalizedPlanId,
    auditId: auditRow?.id ?? null,
  };
}

// ─── Force sync ─────────────────────────────────────────────────────────────────

/**
 * Force-syncs a company's package_type to match its product_type.
 */
export async function forceSyncUser(
  ownerId: string,
  targetUserId: string,
  ownerIp: string | undefined,
  options: { reason?: string } = {},
): Promise<ReconcileResult> {
  return reconcileUser(ownerId, targetUserId, ownerIp, { dryRun: false, reason: options.reason ?? 'Force sync' });
}
