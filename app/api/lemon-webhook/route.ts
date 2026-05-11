import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Database } from '@/types/database';

// ─── Admin client ─────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ─── Lemon Squeezy payload types ─────────────────────────────────────────────

interface LsAttributes {
  status:          string;
  trial_ends_at:   string | null;
  renews_at:       string | null;
  ends_at:         string | null;
  cancelled:       boolean;
  order_id:        number;
  product_id:      number;
  variant_id:      number;
  product_name:    string;
  variant_name:    string;
  customer_id:     number;
  first_subscription_item?: {
    subscription_id: number;
  };
}

interface LsRelationships {
  customer?: { data?: { id: string } };
}

interface LsData {
  id:            string;
  type:          string;
  attributes:    LsAttributes;
  relationships: LsRelationships;
}

interface LsMeta {
  event_name:       string;
  test_mode:        boolean;
  custom_data?:     { company_id?: string; [k: string]: unknown };
  webhook_id?:      string;
}

interface LsWebhookPayload {
  meta: LsMeta;
  data: LsData;
}

// Maps Lemon Squeezy subscription status to our billing_metadata.status enum
const LS_STATUS_MAP: Record<string, string> = {
  active:      'active',
  on_trial:    'active',    // treat trialling subscriptions as active
  past_due:    'past_due',
  paused:      'paused',
  cancelled:   'cancelled',
  expired:     'cancelled',
  unpaid:      'past_due',
};

// Maps Lemon event_name to companies.subscription_status
const EVENT_TO_COMPANY_STATUS: Record<string, string> = {
  subscription_created:  'active',
  subscription_updated:  'active',
  subscription_cancelled:'canceled',
  subscription_resumed:  'active',
  subscription_expired:  'canceled',
  subscription_paused:   'active',
  subscription_unpaused: 'active',
};

// ─── Signature verification ───────────────────────────────────────────────────

/**
 * Lemon Squeezy signs each webhook with HMAC-SHA256.
 * The signature is in the X-Signature header as a hex digest.
 * https://docs.lemonsqueezy.com/help/webhooks#signing-requests
 */
function verifyLsSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const sigBuf   = Buffer.from(signature.replace(/^sha256=/, ''), 'hex');
    const expBuf   = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

// ─── Payload validation ───────────────────────────────────────────────────────

function validatePayload(body: unknown): body is LsWebhookPayload {
  if (typeof body !== 'object' || body === null) return false;
  const p = body as Record<string, unknown>;
  if (typeof p.meta !== 'object' || p.meta === null) return false;
  if (typeof p.data !== 'object' || p.data === null) return false;
  const meta = p.meta as Record<string, unknown>;
  const data = p.data as Record<string, unknown>;
  if (typeof meta.event_name !== 'string') return false;
  if (typeof data.id !== 'string')         return false;
  if (typeof data.attributes !== 'object') return false;
  return true;
}

// ─── Sanitisation ─────────────────────────────────────────────────────────────

function sanitizeText(s: unknown, maxLen = 200): string {
  if (typeof s !== 'string') return '';
  return s.replace(/[<>"']/g, '').slice(0, maxLen).trim();
}

// ─── Payload snapshot (strip PII for audit log) ───────────────────────────────

function redactSnapshot(payload: LsWebhookPayload): Record<string, unknown> {
  return {
    event_name:      payload.meta.event_name,
    test_mode:       payload.meta.test_mode,
    data_id:         payload.data.id,
    data_type:       payload.data.type,
    status:          payload.data.attributes.status,
    product_name:    payload.data.attributes.product_name,
    variant_name:    payload.data.attributes.variant_name,
    renews_at:       payload.data.attributes.renews_at,
    ends_at:         payload.data.attributes.ends_at,
    trial_ends_at:   payload.data.attributes.trial_ends_at,
    cancelled:       payload.data.attributes.cancelled,
  };
}

// ─── Core processing ──────────────────────────────────────────────────────────

type ProcessingStatus = 'ok' | 'failed' | 'duplicate' | 'unresolved_company';

interface ProcessResult {
  status:     ProcessingStatus;
  companyId:  string | null;
  error?:     string;
}

async function processWebhook(
  db:      ReturnType<typeof getAdminClient>,
  payload: LsWebhookPayload,
  eventId: string
): Promise<ProcessResult> {
  const eventName = sanitizeText(payload.meta.event_name);

  // ── Idempotency check ─────────────────────────────────────────────────────
  // Attempt to claim this event; if another request already did so, skip it.
  const { error: claimError } = await db
    .from('webhook_events' as never)
    .insert({
      event_id:   eventId,
      event_type: eventName,
    } as never);

  if (claimError) {
    // Unique constraint violation → duplicate delivery
    if (claimError.code === '23505') {
      return { status: 'duplicate', companyId: null };
    }
    return { status: 'failed', companyId: null, error: `Idempotency insert failed: ${claimError.message}` };
  }

  // ── Company resolution ────────────────────────────────────────────────────
  // Primary:   custom_data.company_id set during checkout creation
  // Fallback:  look up billing_metadata by ls_subscription_id
  let companyId: string | null = null;

  const customCompanyId = payload.meta.custom_data?.company_id;
  if (typeof customCompanyId === 'string' && customCompanyId.length > 0) {
    const { data: co } = await db
      .from('companies')
      .select('id')
      .eq('id', customCompanyId)
      .maybeSingle();
    companyId = co?.id ?? null;
  }

  if (!companyId) {
    const lsSubId = String(payload.data.id);
    const { data: bm } = await db
      .from('billing_metadata')
      .select('company_id')
      .eq('ls_subscription_id', lsSubId)
      .maybeSingle();
    companyId = bm?.company_id ?? null;
  }

  if (!companyId) {
    // Update webhook_events row with null company for traceability
    return { status: 'unresolved_company', companyId: null, error: 'Could not resolve company from webhook payload' };
  }

  // Update the event row with the resolved company
  await db
    .from('webhook_events' as never)
    .update({ company_id: companyId } as never)
    .eq('event_id', eventId);

  // ── Extract billing fields ─────────────────────────────────────────────────
  const attrs       = payload.data.attributes;
  const lsSubId     = String(payload.data.id);
  const lsCustomerId = attrs.customer_id ? String(attrs.customer_id) : null;
  const lsProductId  = attrs.product_id  ? String(attrs.product_id)  : null;
  const lsVariantId  = attrs.variant_id  ? String(attrs.variant_id)  : null;
  const planName     = sanitizeText(`${attrs.product_name} ${attrs.variant_name}`.trim(), 100) || 'Pro';

  const billingStatus = LS_STATUS_MAP[attrs.status] ?? 'active';
  const companyStatus = EVENT_TO_COMPANY_STATUS[eventName] ?? 'active';

  // ── Upsert billing_metadata ───────────────────────────────────────────────
  const billingUpdate: Record<string, unknown> = {
    ls_subscription_id: lsSubId,
    ls_customer_id:     lsCustomerId,
    ls_product_id:      lsProductId,
    ls_variant_id:      lsVariantId,
    plan_name:          planName,
    status:             billingStatus,
    renews_at:          attrs.renews_at   ?? null,
    ends_at:            attrs.ends_at     ?? null,
    trial_ends_at:      attrs.trial_ends_at ?? null,
    raw_payload:        payload as unknown as never,
    updated_at:         new Date().toISOString(),
  };

  if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
    billingUpdate.cancelled_at = new Date().toISOString();
  }

  const { error: bmError } = await db
    .from('billing_metadata')
    .upsert(
      { company_id: companyId, ...billingUpdate } as never,
      { onConflict: 'company_id' }
    );

  if (bmError) {
    return { status: 'failed', companyId, error: `billing_metadata upsert failed: ${bmError.message}` };
  }

  // ── Update companies.subscription_status ──────────────────────────────────
  const { error: coError } = await db
    .from('companies')
    .update({ subscription_status: companyStatus, updated_at: new Date().toISOString() })
    .eq('id', companyId);

  if (coError) {
    return { status: 'failed', companyId, error: `companies update failed: ${coError.message}` };
  }

  return { status: 'ok', companyId };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startMs = Date.now();
  const db      = getAdminClient();

  // ── Read raw body for signature verification ───────────────────────────────
  const rawBody = await req.text();

  // ── Signature verification ─────────────────────────────────────────────────
  const signingSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const signature     =
    req.headers.get('x-signature') ??
    req.headers.get('x-lemon-squeezy-signature') ??
    '';

  if (!signingSecret) {
    // In production, a missing secret is a hard failure
    if (process.env.NODE_ENV === 'production') {
      console.error('[lemon-webhook] LEMONSQUEEZY_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }
    console.warn('[lemon-webhook] Signature check skipped — LEMONSQUEEZY_WEBHOOK_SECRET not set');
  } else if (!verifyLsSignature(rawBody, signature, signingSecret)) {
    console.warn('[lemon-webhook] Signature verification failed');
    // Audit the rejection before returning
    await db.from('webhook_audit' as never).insert({
      event_id:        'unknown',
      event_type:      'unknown',
      status:          'failed',
      payload_snapshot: {},
      error_detail:    'Signature verification failed',
      duration_ms:     Date.now() - startMs,
      processed_by:    'webhook',
    } as never);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // ── Parse and validate payload ─────────────────────────────────────────────
  let payload: LsWebhookPayload;
  try {
    const parsed = JSON.parse(rawBody);
    if (!validatePayload(parsed)) {
      return NextResponse.json({ error: 'Malformed webhook payload' }, { status: 400 });
    }
    payload = parsed;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Lemon Squeezy sends a unique event UUID in meta.webhook_id (LS v2) or we
  // fall back to a deterministic key of event_name + data.id
  const eventId =
    payload.meta.webhook_id ??
    `${payload.meta.event_name}:${payload.data.id}`;

  const eventName = sanitizeText(payload.meta.event_name);
  const snapshot  = redactSnapshot(payload);

  // ── Only handle subscription events ───────────────────────────────────────
  const HANDLED_EVENTS = new Set([
    'subscription_created',
    'subscription_updated',
    'subscription_cancelled',
    'subscription_resumed',
    'subscription_expired',
    'subscription_paused',
    'subscription_unpaused',
  ]);

  if (!HANDLED_EVENTS.has(eventName)) {
    // Acknowledge unhandled events so LS doesn't retry
    return NextResponse.json({ received: true, handled: false });
  }

  // ── Process ────────────────────────────────────────────────────────────────
  let result: ProcessResult = { status: 'ok', companyId: null };

  try {
    result = await processWebhook(db, payload, eventId);
  } catch (err) {
    result = {
      status:    'failed',
      companyId: null,
      error:     err instanceof Error ? err.message : 'Unknown error',
    };
    console.error('[lemon-webhook] Unexpected error:', err);
  }

  // ── Write audit log ────────────────────────────────────────────────────────
  await db.from('webhook_audit' as never).insert({
    event_id:         eventId,
    company_id:       result.companyId,
    event_type:       eventName,
    status:           result.status,
    payload_snapshot: snapshot,
    error_detail:     result.error ?? null,
    duration_ms:      Date.now() - startMs,
    processed_by:     'webhook',
  } as never);

  // ── Respond ────────────────────────────────────────────────────────────────
  if (result.status === 'duplicate') {
    // Return 200 so LS doesn't retry a duplicate
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (result.status === 'unresolved_company') {
    console.warn(`[lemon-webhook] Could not resolve company for event ${eventId}`);
    // Return 200 to prevent LS retry storms for legitimate configuration gaps
    return NextResponse.json({ received: true, warning: 'company not resolved' });
  }

  if (result.status === 'failed') {
    console.error(`[lemon-webhook] Processing failed for event ${eventId}:`, result.error);
    return NextResponse.json(
      { error: 'Processing failed — will retry', detail: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true, company_id: result.companyId });
}
