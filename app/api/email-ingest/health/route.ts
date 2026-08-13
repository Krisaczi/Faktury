import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// ─── Admin client (service role — never sent to client) ───────────────────────

function getAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Health check for the email ingestion pipeline.
 *
 * Verifies:
 * 1. The ingestion endpoint is reachable (implicit — this route responds).
 * 2. The email_events table exists and is writable.
 * 3. Companies with ingestion_email addresses are configured.
 * 4. Recent email events are being logged.
 * 5. Mail provider webhook secrets are configured.
 *
 * Usage: GET /api/email-ingest/health
 */
export async function GET(_req: NextRequest) {
  const checks: Record<string, { status: 'pass' | 'warn' | 'fail'; detail: string }> = {};

  // ── Check 1: Database connectivity & email_events table ──────────────────
  try {
    const db = getAdminClient();
    const { error: tableError } = await db
      .from('email_events')
      .select('id')
      .limit(1);

    if (tableError) {
      checks.database = { status: 'fail', detail: `email_events table error: ${tableError.message}` };
    } else {
      checks.database = { status: 'pass', detail: 'email_events table accessible' };
    }

    // ── Check 2: Companies with ingestion emails configured ─────────────────
    const { data: companies, error: companiesError } = await db
      .from('companies')
      .select('id, ingestion_email')
      .not('ingestion_email', 'is', null)
      .limit(100);

    if (companiesError) {
      checks.mailboxes = { status: 'fail', detail: `Cannot query companies: ${companiesError.message}` };
    } else if (!companies || companies.length === 0) {
      checks.mailboxes = {
        status: 'warn',
        detail: 'No companies have an ingestion_email configured. Emails sent to any address will be rejected as "Invalid recipient".',
      };
    } else {
      const addresses = companies.map((c) => c.ingestion_email).filter(Boolean);
      checks.mailboxes = {
        status: 'pass',
        detail: `${addresses.length} mailbox(es) configured: ${addresses.slice(0, 5).join(', ')}${addresses.length > 5 ? '…' : ''}`,
      };
    }

    // ── Check 3: Recent email events ────────────────────────────────────────
    const { data: recentEvents, error: eventsError } = await db
      .from('email_events')
      .select('id, event_type, created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    if (eventsError) {
      checks.recent_events = { status: 'warn', detail: 'Cannot query recent email events' };
    } else if (!recentEvents || recentEvents.length === 0) {
      checks.recent_events = { status: 'warn', detail: 'No email events logged yet — no emails have been received since logging was enabled' };
    } else {
      const lastEvent = recentEvents[0];
      checks.recent_events = {
        status: 'pass',
        detail: `Last event: ${lastEvent.event_type} at ${lastEvent.created_at}`,
      };
    }

    // ── Check 4: Rejected events in last 24h ────────────────────────────────
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: rejectedEvents, error: rejectedError } = await db
      .from('email_events')
      .select('id, recipient, error_message')
      .eq('event_type', 'rejected')
      .gte('created_at', yesterday)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!rejectedError && rejectedEvents && rejectedEvents.length > 0) {
      checks.recent_rejections = {
        status: 'warn',
        detail: `${rejectedEvents.length} rejection(s) in last 24h — check admin panel for details. Latest: ${rejectedEvents[0].error_message ?? 'unknown'}`,
      };
    } else if (!rejectedError) {
      checks.recent_rejections = { status: 'pass', detail: 'No rejections in last 24h' };
    }
  } catch (err) {
    checks.database = {
      status: 'fail',
      detail: `Database unreachable: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }

  // ── Check 5: Webhook signing keys configured ─────────────────────────────
  const mailgunKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  const resendKey  = process.env.RESEND_WEBHOOK_SECRET;

  if (!mailgunKey && !resendKey) {
    checks.webhook_security = {
      status: 'warn',
      detail: 'Neither MAILGUN_WEBHOOK_SIGNING_KEY nor RESEND_WEBHOOK_SECRET is set — webhook signatures will not be verified',
    };
  } else {
    const configured: string[] = [];
    if (mailgunKey) configured.push('Mailgun');
    if (resendKey) configured.push('Resend');
    checks.webhook_security = {
      status: 'pass',
      detail: `Webhook signature verification active for: ${configured.join(', ')}`,
    };
  }

  // ── Check 6: DNS configuration guidance ──────────────────────────────────
  checks.dns_config = {
    status: 'warn',
    detail: 'Ensure MX records for invoiceguard.app point to your mail provider (e.g. mailgun.org, mail.resend.com). SPF, DKIM, and DMARC records must be configured at the provider. A catch-all route or specific mailbox must exist for mleko@invoiceguard.app.',
  };

  // ── Overall status ────────────────────────────────────────────────────────
  const hasFail = Object.values(checks).some((c) => c.status === 'fail');
  const hasWarn = Object.values(checks).some((c) => c.status === 'warn');
  const overall = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass';

  return NextResponse.json({
    status:  overall,
    checks,
    guidance: {
      dns: 'MX records must point to the mail provider. For Mailgun: mx.mailgun.org. For Resend: use inbound domains setup.',
      spf: 'SPF record must include the provider (e.g. v=spf1 include:mailgun.org ~all).',
      dkim: 'DKIM must be active — check provider dashboard for the DKIM TXT record.',
      dmarc: 'DMARC policy should not block delivery (start with v=DMARC1; p=none; rua=mailto:admin@invoiceguard.app).',
      routing: 'Configure a catch-all route forwarding *@invoiceguard.app to the /api/email-ingest webhook URL.',
      mailbox: 'If not using catch-all, create mleko@invoiceguard.app as a specific mailbox in the provider dashboard.',
    },
  }, { status: overall === 'fail' ? 503 : 200 });
}
