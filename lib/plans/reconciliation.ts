import { getSupabaseServerClient } from '@/lib/supabase/server';
import { normalizePlanId, getPlanLabel } from './canonical-plan';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ReconciliationEntry {
  userId:        string;
  email:         string;
  companyId:     string | null;
  localPlan:     string;       // plan in subscriptions table
  companyPlan:   string;       // plan in companies.product_type
  canonicalPlan: string;       // the reconciled/correct plan
  mismatch:      boolean;
  lastSyncedAt:  string | null;
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
 * Scans all users for plan mismatches between subscriptions table and companies table.
 * Returns a report with recommended actions.
 */
export async function generateReconciliationReport(): Promise<ReconciliationReport> {
  const supabase = await getSupabaseServerClient();

  // Get all active users with their company plan and subscription
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
  const userIds = users.map((u: { id: string }) => u.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [companiesRes, subsRes] = await Promise.all([
    companyIds.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (supabase as any).from('companies').select('id, product_type, package_type, subscription_status').in('id', companyIds)
      : Promise.resolve({ data: [] }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('subscriptions').select('user_id, plan_id, status, last_synced_at').in('user_id', userIds),
  ]);

  const companyMap = new Map(
    ((companiesRes.data ?? []) as { id: string; product_type: string | null; package_type: string; subscription_status: string }[])
      .map((c) => [c.id, c])
  );
  const subMap = new Map(
    ((subsRes.data ?? []) as { user_id: string; plan_id: string; status: string; last_synced_at: string | null }[])
      .map((s) => [s.user_id, s])
  );

  const entries: ReconciliationEntry[] = [];
  let mismatched = 0;
  let matched = 0;

  for (const u of users as { id: string; email: string; company_id: string | null }[]) {
    const sub = subMap.get(u.id);
    const company = u.company_id ? companyMap.get(u.company_id) : null;

    const subPlan = sub ? normalizePlanId(sub.plan_id) : 'starter';
    const companyPlan = normalizePlanId(company?.product_type ?? company?.package_type ?? 'starter');
    const canonicalPlan = companyPlan; // company.product_type is the derived truth when no subscription

    const localPlan = subPlan;
    const hasMismatch = localPlan !== canonicalPlan;

    if (hasMismatch) {
      mismatched++;
    } else {
      matched++;
    }

    entries.push({
      userId:        u.id,
      email:         u.email,
      companyId:     u.company_id,
      localPlan,
      companyPlan,
      canonicalPlan,
      mismatch:      hasMismatch,
      lastSyncedAt:  sub?.last_synced_at ?? null,
      recommendedAction: hasMismatch ? 'fix' : 'noop',
      reason: hasMismatch
        ? `Subskrypcja: ${getPlanLabel(localPlan)}, firma: ${getPlanLabel(companyPlan)} — wymaga synchronizacji`
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
 * Reconciles a single user's plan. In dry-run mode, returns what would change
 * without making any modifications. In apply mode, syncs the subscription to match
 * the canonical plan and logs the action.
 */
export async function reconcileUser(
  ownerId: string,
  targetUserId: string,
  ownerIp: string | undefined,
  options: { dryRun?: boolean; reason?: string } = {},
): Promise<ReconcileResult> {
  const supabase = await getSupabaseServerClient();

  // Get target user
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

  // Get current subscription
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub } = await (supabase as any)
    .from('subscriptions')
    .select('id, plan_id, status, last_synced_at')
    .eq('user_id', targetUserId)
    .maybeSingle();

  // Get company plan (canonical)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('product_type, subscription_status')
    .eq('id', user.company_id)
    .maybeSingle();

  const localPlan = normalizePlanId(sub?.plan_id ?? 'starter');
  const canonicalPlan = normalizePlanId(company?.product_type ?? 'starter');

  if (localPlan === canonicalPlan) {
    // No mismatch — just update last_synced_at
    if (!options.dryRun && sub) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('subscriptions')
        .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', sub.id);
    }

    return {
      ok: true,
      userId: targetUserId,
      fromPlan: localPlan,
      toPlan: canonicalPlan,
      action: 'noop',
      auditId: null,
    };
  }

  // Mismatch detected
  const action = options.dryRun ? 'dry_run' : 'fix';

  if (options.dryRun) {
    return {
      ok: true,
      userId: targetUserId,
      fromPlan: localPlan,
      toPlan: canonicalPlan,
      action: 'dry_run',
      auditId: null,
    };
  }

  // Apply: upsert subscription with canonical plan
  const status = company?.subscription_status === 'canceled' ? 'canceled' : 'active';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upsertErr } = await (supabase as any)
    .from('subscriptions')
    .upsert({
      user_id:        targetUserId,
      company_id:     user.company_id,
      plan_id:        canonicalPlan,
      status,
      last_synced_at: new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (upsertErr) {
    return {
      ok: false,
      userId: targetUserId,
      fromPlan: localPlan,
      toPlan: canonicalPlan,
      action: 'flag',
      auditId: null,
      error: 'Błąd aktualizacji subskrypcji.',
    };
  }

  // Also sync companies.package_type to match product_type (fix corruption)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('companies')
    .update({ package_type: canonicalPlan, updated_at: new Date().toISOString() })
    .eq('id', user.company_id);

  // Log to reconciliation audit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: auditRow } = await (supabase as any)
    .from('plan_reconciliation_log')
    .insert({
      owner_id:       ownerId,
      target_user_id: targetUserId,
      company_id:     user.company_id,
      local_plan:     localPlan,
      canonical_plan: canonicalPlan,
      source:         'reconciliation',
      action:         'fix',
      reason:         options.reason ?? 'Plan mismatch — subscription synced to canonical',
      owner_ip:       ownerIp ?? null,
    })
    .select('id')
    .maybeSingle();

  return {
    ok: true,
    userId: targetUserId,
    fromPlan: localPlan,
    toPlan: canonicalPlan,
    action: 'fix',
    auditId: auditRow?.id ?? null,
  };
}

// ─── Bulk reconcile ─────────────────────────────────────────────────────────────

/**
 * Reconciles all mismatched users. Returns results for each.
 */
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

/**
 * Reconciles a specific set of users identified by email addresses.
 * If no emails are provided, reconciles all mismatched users.
 */
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
    // All active users
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
 * Force-sets a user's plan to a specific plan ID. Writes to subscriptions,
 * companies, and plan_change_audit with full audit trail.
 * This is the owner's direct plan assignment tool.
 */
export async function forceSetPlan(
  ownerId: string,
  targetUserId: string,
  planId: string,
  ownerIp: string | undefined,
  options: { effectiveFrom?: string; reason?: string } = {},
): Promise<ForceSetPlanResult> {
  const supabase = await getSupabaseServerClient();

  const normalizedPlanId = normalizePlanId(planId);

  // Get target user
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

  // Get current subscription for fromPlan
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub } = await (supabase as any)
    .from('subscriptions')
    .select('id, plan_id')
    .eq('user_id', targetUserId)
    .maybeSingle();

  const fromPlan = normalizePlanId(sub?.plan_id ?? 'starter');
  const now = new Date().toISOString();
  const effectiveFrom = options.effectiveFrom ?? now;

  // 1. Upsert subscription
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upsertErr } = await (supabase as any)
    .from('subscriptions')
    .upsert({
      user_id:        targetUserId,
      company_id:     user.company_id,
      plan_id:        normalizedPlanId,
      status:         'active',
      last_synced_at: now,
      effective_from: effectiveFrom,
      updated_at:     now,
    }, { onConflict: 'user_id' });

  if (upsertErr) {
    return { ok: false, userId: targetUserId, fromPlan, toPlan: normalizedPlanId, auditId: null, error: 'Błąd ustawiania planu.' };
  }

  // 2. Sync companies table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('companies')
    .update({
      product_type:        normalizedPlanId,
      package_type:        normalizedPlanId,
      subscription_status: 'active',
      package_assigned_at: now,
      updated_at:          now,
    })
    .eq('id', user.company_id);

  // 3. Log to plan_change_audit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
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
    });

  // 4. Log to billing_audit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('billing_audit')
    .insert({
      company_id:  user.company_id,
      actor_id:    ownerId,
      old_package: fromPlan,
      new_package: normalizedPlanId,
      provider:    'internal',
      event_type:  'plan_changed',
      from_plan:   fromPlan,
      to_plan:     normalizedPlanId,
      changed_by:  ownerId,
      metadata:    { reason: options.reason ?? 'Owner force-set plan', source: 'owner' },
    });

  // 5. Log to plan_reconciliation_log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: auditRow } = await (supabase as any)
    .from('plan_reconciliation_log')
    .insert({
      owner_id:       ownerId,
      target_user_id: targetUserId,
      company_id:     user.company_id,
      local_plan:     fromPlan,
      canonical_plan: normalizedPlanId,
      source:         'manual',
      action:         'fix',
      reason:         options.reason ?? 'Owner force-set plan',
      owner_ip:       ownerIp ?? null,
    })
    .select('id')
    .maybeSingle();

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
 * Force-overwrites the local subscription record to match the company's product_type.
 * This is the "nuclear option" — always writes, even if there's no apparent mismatch.
 */
export async function forceSyncUser(
  ownerId: string,
  targetUserId: string,
  ownerIp: string | undefined,
  options: { reason?: string } = {},
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
  const { data: sub } = await (supabase as any)
    .from('subscriptions')
    .select('id, plan_id')
    .eq('user_id', targetUserId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from('companies')
    .select('product_type, package_type, subscription_status')
    .eq('id', user.company_id)
    .maybeSingle();

  const fromPlan = normalizePlanId(sub?.plan_id ?? 'starter');
  const toPlan = normalizePlanId(company?.product_type ?? company?.package_type ?? 'starter');
  const status = company?.subscription_status === 'canceled' ? 'canceled' : 'active';

  // Force overwrite subscription
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upsertErr } = await (supabase as any)
    .from('subscriptions')
    .upsert({
      user_id:        targetUserId,
      company_id:     user.company_id,
      plan_id:        toPlan,
      status,
      last_synced_at: new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (upsertErr) {
    return { ok: false, userId: targetUserId, fromPlan, toPlan, action: 'flag', auditId: null, error: 'Błąd wymuszonej synchronizacji.' };
  }

  // Also fix companies.package_type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('companies')
    .update({ package_type: toPlan, updated_at: new Date().toISOString() })
    .eq('id', user.company_id);

  // Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: auditRow } = await (supabase as any)
    .from('plan_reconciliation_log')
    .insert({
      owner_id:       ownerId,
      target_user_id: targetUserId,
      company_id:     user.company_id,
      local_plan:     fromPlan,
      canonical_plan: toPlan,
      source:         'force_sync',
      action:         'fix',
      reason:         options.reason ?? 'Force sync — subscription overwritten from company state',
      owner_ip:       ownerIp ?? null,
    })
    .select('id')
    .maybeSingle();

  return {
    ok: true,
    userId: targetUserId,
    fromPlan,
    toPlan,
    action: 'fix',
    auditId: auditRow?.id ?? null,
  };
}
