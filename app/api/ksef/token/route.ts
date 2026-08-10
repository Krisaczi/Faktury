import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ALLOWED_ENVS = ['test', 'prod'] as const;
type KsefEnv = (typeof ALLOWED_ENVS)[number];
const ALLOWED_ROLES = ['owner', 'accountant'] as const;

function maskToken(token: string): string {
  if (!token || token.length <= 8) return '****';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

function generateRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID().slice(0, 8);
    }
  } catch {
    // fallthrough
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();

  try {
    // ── 1. Auth & session extraction ──────────────────────────────────────────
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    // ── 2. Parse and validate body ─────────────────────────────────────────────
    let body: { token?: string; environment?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, { status: 400 });
    }

    const token = body.token?.trim();
    const envRaw = body.environment?.trim();

    if (!token || token.length < 4) {
      return NextResponse.json({ error: 'Token is required', code: 'TOKEN_REQUIRED' }, { status: 400 });
    }

    if (!envRaw || !ALLOWED_ENVS.includes(envRaw as KsefEnv)) {
      return NextResponse.json({ error: 'Environment must be "test" or "prod"', code: 'INVALID_ENV' }, { status: 400 });
    }

    const env = envRaw as KsefEnv;

    // ── 3. Look up user's role and company_id from the database ─────────────────
    const { data: userRow, error: rowError } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (rowError) {
      console.error('[api/ksef/token] users query error', { requestId, userId: user.id, error: rowError.message });
      return NextResponse.json({ error: 'Database error', code: 'DB_ERROR' }, { status: 500 });
    }

    if (!userRow) {
      return NextResponse.json({ error: 'User record not found', code: 'USER_NOT_FOUND' }, { status: 404 });
    }

    const companyId: string | null = userRow.company_id ?? null;
    const role: string = userRow.role ?? 'accountant';

    if (!companyId) {
      return NextResponse.json({ error: 'Company id missing in session', code: 'COMPANY_ID_MISSING' }, { status: 400 });
    }

    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      console.warn('[api/ksef/token] forbidden role', { requestId, userId: user.id, role });
      return NextResponse.json({ error: 'Insufficient role', code: 'FORBIDDEN' }, { status: 403 });
    }

    // ── 4. Check for existing credentials to audit old values ───────────────────
    const { data: existing } = await supabase
      .from('ksef_credentials')
      .select('token, environment, updated_by')
      .eq('company_id', companyId)
      .eq('environment', env)
      .maybeSingle();

    const oldEnv = existing?.environment ?? null;
    const hadToken = !!existing?.token;

    // ── 5. Upsert the credential ───────────────────────────────────────────────
    const nowIso = new Date().toISOString();

    const { error: upsertError } = await supabase
      .from('ksef_credentials')
      .upsert(
        {
          company_id: companyId,
          environment: env,
          token,
          updated_by: user.id,
          updated_at: nowIso,
        },
        { onConflict: 'company_id,environment' }
      );

    if (upsertError) {
      console.error('[api/ksef/token] upsert error', { requestId, userId: user.id, companyId, error: upsertError.message });
      return NextResponse.json({ error: 'Failed to save token', code: 'SAVE_FAILED' }, { status: 500 });
    }

    // ── 6. Write audit rows ────────────────────────────────────────────────────
    const auditRows: Array<{
      company_id: string;
      actor_id: string;
      field_changed: string;
      old_value_masked: string | null;
      new_value_masked: string;
    }> = [];

    // Token change audit
    auditRows.push({
      company_id: companyId,
      actor_id: user.id,
      field_changed: 'ksef_token',
      old_value_masked: hadToken ? maskToken(existing?.token ?? '') : null,
      new_value_masked: maskToken(token),
    });

    // Environment change audit (only if env actually changed)
    if (oldEnv && oldEnv !== env) {
      auditRows.push({
        company_id: companyId,
        actor_id: user.id,
        field_changed: 'ksef_env',
        old_value_masked: oldEnv,
        new_value_masked: env,
      });
    }

    const { error: auditError } = await supabase
      .from('ksef_audit')
      .insert(auditRows);

    if (auditError) {
      console.warn('[api/ksef/token] audit write failed (non-fatal)', { requestId, userId: user.id, companyId, error: auditError.message });
    }

    // ── 7. Success ─────────────────────────────────────────────────────────────
    console.info('[api/ksef/token] token saved', { requestId, userId: user.id, companyId, role, env });

    return NextResponse.json({
      ok: true,
      environment: env,
      updated_at: nowIso,
    });
  } catch (err) {
    console.error('[api/ksef/token] unexpected error', { requestId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
