import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePlanByCompanyId } from '@/lib/plans/canonical-plan';
import { normalizePlanId } from '@/lib/plans/plan-mapping';

interface ReconcileBatchBody {
  entityIds?:    string[];
  companyNames?: string[];
  dryRun?:       boolean;
}

interface ReconcileEntry {
  companyId:        string;
  companyName:      string;
  assignmentPlan:   string | null;
  companyPlan:      string;
  effectivePlan:    string;
  pricingTiersPlan: string | null;
  lastUpdatedAt:    string | null;
  mismatch:         boolean;
  recommendedAction: 'noop' | 'fix' | 'flag';
  reason:           string;
  applied?:         boolean;
}

/**
 * POST /api/owner/plans/reconcile-batch
 *
 * Body: { entityIds?: string[], companyNames?: string[], dryRun?: boolean }
 *
 * Scans companies for plan inconsistencies between plan_assignments (canonical)
 * and companies.product_type (derived). In dryRun mode, produces a report.
 * In apply mode, fixes mismatches by upserting plan_assignments and syncing
 * companies columns.
 */
export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: u } = await (supabase as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (u?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden — tylko właściciel' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as ReconcileBatchBody));
  const { entityIds, companyNames, dryRun } = body as ReconcileBatchBody;

  // ─── Build query for target companies ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('companies')
    .select('id, name, product_type, package_type, package_assigned_at, updated_at')
    .order('name');

  if (entityIds && entityIds.length > 0) {
    query = query.in('id', entityIds);
  } else if (companyNames && companyNames.length > 0) {
    // Use OR for name matching (case-insensitive)
    const nameFilter = companyNames.map((n) => `name.ilike.%${n}%`).join(',');
    query = query.or(nameFilter);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: companies, error: companiesErr } = await query;

  if (companiesErr) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!companies || companies.length === 0) {
    return NextResponse.json({
      dryRun:    dryRun ?? false,
      total:     0,
      entries:   [],
      message:   'No companies found matching the criteria.',
    });
  }

  // ─── Fetch plan_assignments for all target companies ─────────────────────────
  const companyIds = companies.map((c: { id: string }) => c.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: assignments } = await (supabase as any)
    .from('plan_assignments')
    .select('entity_id, plan_id, status, updated_at')
    .in('entity_id', companyIds)
    .eq('status', 'active');

  const assignmentMap = new Map(
    ((assignments ?? []) as { entity_id: string; plan_id: string; updated_at: string }[])
      .map((a) => [a.entity_id, a]),
  );

  // ─── Fetch pricing_tiers metadata (read-only) ────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tiers } = await (supabase as any)
    .from('pricing_tiers')
    .select('key, name')
    .in('key', ['starter', 'professional']);

  const tierMap = new Map(
    ((tiers ?? []) as { key: string; name: string }[]).map((t) => [t.key, t.name]),
  );

  // ─── Build reconciliation entries ────────────────────────────────────────────
  const entries: ReconcileEntry[] = [];
  const ownerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;

  for (const company of companies as { id: string; name: string; product_type: string | null; package_type: string | null; package_assigned_at: string | null; updated_at: string }[]) {
    const assignment = assignmentMap.get(company.id);
    const assignmentPlan = assignment ? normalizePlanId(assignment.plan_id) : null;
    const companyPlan = normalizePlanId(company.product_type ?? company.package_type ?? 'starter');
    const effectivePlan = assignmentPlan ?? companyPlan;
    const pricingTiersPlan = tierMap.get(effectivePlan) ?? null;

    const mismatch = assignmentPlan !== null && assignmentPlan !== companyPlan;

    let recommendedAction: ReconcileEntry['recommendedAction'] = 'noop';
    let reason = 'Spójne';

    if (!assignment) {
      recommendedAction = 'fix';
      reason = 'Brak wpisu w plan_assignments — wymaga utworzenia';
    } else if (mismatch) {
      recommendedAction = 'fix';
      reason = `plan_assignments=${assignmentPlan} != companies.product_type=${companyPlan}`;
    }

    entries.push({
      companyId:        company.id,
      companyName:      company.name,
      assignmentPlan,
      companyPlan,
      effectivePlan,
      pricingTiersPlan,
      lastUpdatedAt:    assignment?.updated_at ?? company.updated_at ?? null,
      mismatch,
      recommendedAction,
      reason,
    });

    // ─── Apply fix if not dryRun ──────────────────────────────────────────────
    if (!dryRun && recommendedAction === 'fix') {
      const nowIso = new Date().toISOString();
      const targetPlan = assignmentPlan ?? companyPlan;

      // Upsert plan_assignments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('plan_assignments')
        .upsert({
          entity_id:      company.id,
          entity_type:    'company',
          plan_id:        targetPlan,
          status:         'active',
          effective_from: nowIso,
          updated_at:     nowIso,
          metadata:       { source: 'reconcile_batch', reason },
        }, { onConflict: 'entity_id,entity_type' })
        .eq('status', 'active');

      // Sync companies columns
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('companies')
        .update({
          product_type:        targetPlan,
          package_type:        targetPlan,
          package_assigned_at: nowIso,
          updated_at:          nowIso,
        })
        .eq('id', company.id);

      // Audit log
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('plan_change_audit')
        .insert({
          owner_id:       user.id,
          target_user_id: null,
          company_id:     company.id,
          from_plan:      companyPlan,
          to_plan:        targetPlan,
          effective:      'now',
          reason:         `Reconcile batch: ${reason}`,
          owner_ip:       ownerIp ?? null,
          provider:       'system',
        });

      entries[entries.length - 1].applied = true;
    }
  }

  const totalFixed = entries.filter((e) => e.applied).length;
  const totalMismatched = entries.filter((e) => e.recommendedAction !== 'noop').length;

  return NextResponse.json({
    dryRun:       dryRun ?? false,
    total:        entries.length,
    totalMismatched,
    totalFixed:   dryRun ? 0 : totalFixed,
    entries,
    generatedAt:  new Date().toISOString(),
  });
}
