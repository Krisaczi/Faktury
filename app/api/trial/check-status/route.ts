import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  buildTrialExpiringSoonEmail,
  buildTrialExpiredEmail,
} from '@/lib/trial/email-templates';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrialCompanyRow {
  id:               string;
  name:             string;
  trial_expires_at: string;
  trial_active:     boolean;
}

interface SendResult {
  id?:   string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function validateCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const header = req.headers.get('x-cron-secret');
  try {
    const { timingSafeEqual } = require('crypto') as typeof import('crypto');
    return (
      header !== null &&
      header.length === secret.length &&
      timingSafeEqual(Buffer.from(header), Buffer.from(secret))
    );
  } catch {
    return header === secret;
  }
}

async function sendEmail(opts: {
  to: string; subject: string; html: string; text: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: 'RESEND_API_KEY not configured' };

  const from = process.env.RESEND_FROM_EMAIL ?? 'noreply@updates.invoiceguard.app';

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    return { error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
  }
  const json = await res.json() as { id?: string };
  return { id: json.id };
}

function resolveUpgradeUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return `${base}/pricing`;
}

// ─── Core: processTrials ──────────────────────────────────────────────────────
// Exported separately so it can be tested without HTTP.

export interface ProcessTrialsResult {
  expired_processed:      number;
  expiring_soon_processed: number;
  emails_sent:             number;
  errors:                  { companyId: string; type: string; error: string }[];
  dry_run:                 boolean;
}

async function processTrials(opts: { dryRun?: boolean } = {}): Promise<ProcessTrialsResult> {
  const { dryRun = false } = opts;
  const db          = getAdminClient();
  const now         = new Date();
  const in48h       = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const upgradeUrl  = resolveUpgradeUrl();

  const result: ProcessTrialsResult = {
    expired_processed:      0,
    expiring_soon_processed: 0,
    emails_sent:             0,
    errors:                 [],
    dry_run:                dryRun,
  };

  // ── 1. Find expired trials (trial_active = true AND trial_expires_at <= now) ─

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: expired, error: expiredErr } = await (db as any)
    .from('companies')
    .select('id, name, trial_expires_at, trial_active')
    .eq('trial_active', true)
    .lte('trial_expires_at', now.toISOString());

  if (expiredErr) {
    console.error('[check-trial-status] failed to fetch expired trials:', expiredErr.message);
    result.errors.push({ companyId: '*', type: 'query', error: expiredErr.message });
  }

  for (const company of (expired ?? []) as TrialCompanyRow[]) {
    try {
      // Idempotency: skip if notification already sent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (db as any)
        .from('trial_notifications')
        .select('id')
        .eq('company_id', company.id)
        .eq('type', 'expired')
        .maybeSingle();

      if (existing) continue;

      // 1a. Set trial_active = false
      if (!dryRun) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from('companies')
          .update({ trial_active: false, updated_at: now.toISOString() })
          .eq('id', company.id);
      }

      // 1b. Resolve owner email
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ownerRow } = await (db as any)
        .from('users')
        .select('email')
        .eq('company_id', company.id)
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle();

      const ownerEmail = ownerRow?.email as string | null;
      if (!ownerEmail) {
        result.errors.push({ companyId: company.id, type: 'expired', error: 'No owner email found' });
        continue;
      }

      // 1c. Send email
      const emailPayload = buildTrialExpiredEmail({
        companyName: company.name,
        ownerEmail,
        upgradeUrl,
      });

      let sendResult: SendResult = {};
      if (!dryRun) {
        sendResult = await sendEmail(emailPayload);
      }

      // 1d. Record notification (idempotency row)
      if (!dryRun) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from('trial_notifications')
          .upsert(
            {
              company_id:   company.id,
              type:         'expired',
              sent_at:      now.toISOString(),
              recipient:    ownerEmail,
              resend_id:    sendResult.id ?? null,
              error_detail: sendResult.error ?? null,
            },
            { onConflict: 'company_id,type' },
          );
      }

      if (sendResult.error) {
        result.errors.push({ companyId: company.id, type: 'expired', error: sendResult.error });
      } else {
        result.emails_sent++;
      }
      result.expired_processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error(`[check-trial-status] expired company ${company.id}:`, msg);
      result.errors.push({ companyId: company.id, type: 'expired', error: msg });
    }
  }

  // ── 2. Find trials expiring in next 48 h (not yet expired) ───────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: expiringSoon, error: soonErr } = await (db as any)
    .from('companies')
    .select('id, name, trial_expires_at, trial_active')
    .eq('trial_active', true)
    .gt('trial_expires_at', now.toISOString())
    .lte('trial_expires_at', in48h.toISOString());

  if (soonErr) {
    console.error('[check-trial-status] failed to fetch expiring-soon trials:', soonErr.message);
    result.errors.push({ companyId: '*', type: 'query_soon', error: soonErr.message });
  }

  for (const company of (expiringSoon ?? []) as TrialCompanyRow[]) {
    try {
      // Idempotency
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (db as any)
        .from('trial_notifications')
        .select('id')
        .eq('company_id', company.id)
        .eq('type', 'expiring_soon')
        .maybeSingle();

      if (existing) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ownerRow } = await (db as any)
        .from('users')
        .select('email')
        .eq('company_id', company.id)
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle();

      const ownerEmail = ownerRow?.email as string | null;
      if (!ownerEmail) {
        result.errors.push({ companyId: company.id, type: 'expiring_soon', error: 'No owner email found' });
        continue;
      }

      const emailPayload = buildTrialExpiringSoonEmail({
        companyName: company.name,
        ownerEmail,
        expiresAt:   new Date(company.trial_expires_at),
        upgradeUrl,
      });

      let sendResult: SendResult = {};
      if (!dryRun) {
        sendResult = await sendEmail(emailPayload);
      }

      if (!dryRun) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from('trial_notifications')
          .upsert(
            {
              company_id:   company.id,
              type:         'expiring_soon',
              sent_at:      now.toISOString(),
              recipient:    ownerEmail,
              resend_id:    sendResult.id ?? null,
              error_detail: sendResult.error ?? null,
            },
            { onConflict: 'company_id,type' },
          );
      }

      if (sendResult.error) {
        result.errors.push({ companyId: company.id, type: 'expiring_soon', error: sendResult.error });
      } else {
        result.emails_sent++;
      }
      result.expiring_soon_processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error(`[check-trial-status] expiring-soon company ${company.id}:`, msg);
      result.errors.push({ companyId: company.id, type: 'expiring_soon', error: msg });
    }
  }

  return result;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { dryRun?: boolean };
  const dryRun = body.dryRun === true;

  try {
    const result = await processTrials({ dryRun });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[check-trial-status] unexpected error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
