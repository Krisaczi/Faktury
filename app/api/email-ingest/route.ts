import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import crypto from 'crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = new Set(['pdf', 'csv', 'xml', 'zip', 'jpg', 'jpeg', 'png']);

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf':       'pdf',
  'text/csv':              'csv',
  'application/csv':       'csv',
  'text/plain':            'csv',
  'application/xml':       'xml',
  'text/xml':              'xml',
  'application/zip':       'zip',
  'application/x-zip-compressed': 'zip',
  'image/jpeg':            'jpg',
  'image/jpg':             'jpg',
  'image/png':             'png',
};

// ─── Admin client (service role — never sent to client) ───────────────────────

function getAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ─── Email event logger ───────────────────────────────────────────────────────

type EmailEventType = 'received' | 'rejected' | 'processed' | 'error';

async function logEmailEvent(params: {
  event_type: EmailEventType;
  sender?: string;
  recipient?: string;
  subject?: string;
  provider?: string;
  status_code?: number;
  company_id?: string | null;
  upload_session_id?: string | null;
  attachments_count?: number;
  files_processed?: number;
  error_message?: string | null;
  raw_metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getAdminClient();
    await db.from('email_events').insert({
      event_type:        params.event_type,
      sender:            params.sender ?? null,
      recipient:         params.recipient ?? null,
      subject:           params.subject ?? null,
      provider:          params.provider ?? 'unknown',
      status_code:       params.status_code ?? null,
      company_id:        params.company_id ?? null,
      upload_session_id: params.upload_session_id ?? null,
      attachments_count: params.attachments_count ?? 0,
      files_processed:   params.files_processed ?? 0,
      error_message:     params.error_message ?? null,
      raw_metadata:      params.raw_metadata ?? {},
    } as never);
  } catch (err) {
    console.error('[email-ingest] Failed to log email event:', err);
  }
}

// ─── Signature validation ─────────────────────────────────────────────────────

/**
 * Mailgun signs each webhook with HMAC-SHA256 using the webhook signing key.
 * Signature params arrive as form fields: timestamp, token, signature.
 * https://documentation.mailgun.com/en/latest/user_manual.html#webhooks
 */
function verifyMailgunSignature(
  signingKey: string,
  timestamp: string,
  token: string,
  signature: string
): boolean {
  const value = timestamp + token;
  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(value)
    .digest('hex');
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Resend signs each webhook with HMAC-SHA256 over the raw body.
 * The signature is sent in the Svix-Signature header (svix webhook standard).
 * https://resend.com/docs/dashboard/webhooks/introduction
 */
function verifyResendSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  rawBody: string
): boolean {
  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret.replace(/^whsec_/, ''))
    .update(toSign)
    .digest('base64');
  // svix-signature may be "v1,<base64>" — strip prefix
  const incoming = svixSignature.replace(/^v\d+,/, '');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'base64'),
      Buffer.from(incoming, 'base64')
    );
  } catch {
    return false;
  }
}

// ─── Payload normalisation ────────────────────────────────────────────────────

interface Attachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

interface NormalisedEmail {
  sender: string;
  recipient: string;
  subject: string;
  attachments: Attachment[];
}

/**
 * Mailgun delivers inbound email as multipart/form-data.
 * Attachments are embedded as additional form fields named attachment-1, attachment-2, …
 */
async function parseMailgunPayload(form: FormData): Promise<NormalisedEmail> {
  const sender    = sanitizeText(form.get('sender')?.toString()    ?? form.get('from')?.toString()    ?? '');
  const recipient = sanitizeText(form.get('recipient')?.toString() ?? form.get('to')?.toString()      ?? '');
  const subject   = sanitizeText(form.get('subject')?.toString()   ?? '');

  const attachments: Attachment[] = [];
  let index = 1;

  while (true) {
    const field = form.get(`attachment-${index}`);
    if (!field) break;

    if (field instanceof File) {
      const ext = resolveExtension(field.name, field.type);
      if (ext) {
        attachments.push({
          filename:    sanitizeFilename(field.name),
          content:     Buffer.from(await field.arrayBuffer()),
          contentType: field.type || 'application/octet-stream',
        });
      }
    }
    index++;
  }

  return { sender, recipient, subject, attachments };
}

/**
 * Resend delivers inbound email as JSON.
 * Attachments are base64-encoded strings in the `attachments` array.
 */
async function parseResendPayload(body: Record<string, unknown>): Promise<NormalisedEmail> {
  const emailData = (body.data ?? body) as Record<string, unknown>;

  const sender    = sanitizeText(String(emailData.from    ?? ''));
  const recipient = sanitizeText(String(emailData.to      ?? ''));
  const subject   = sanitizeText(String(emailData.subject ?? ''));

  const attachments: Attachment[] = [];
  const rawAttachments = Array.isArray(emailData.attachments) ? emailData.attachments : [];

  for (const att of rawAttachments) {
    if (typeof att !== 'object' || att === null) continue;
    const a = att as Record<string, unknown>;

    const filename    = sanitizeFilename(String(a.filename ?? a.name ?? 'attachment'));
    const contentType = String(a.content_type ?? a.type ?? 'application/octet-stream');
    const ext         = resolveExtension(filename, contentType);

    if (!ext) continue;

    let content: Buffer;
    if (typeof a.content === 'string') {
      content = Buffer.from(a.content, 'base64');
    } else {
      continue;
    }

    attachments.push({ filename, content, contentType });
  }

  return { sender, recipient, subject, attachments };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeText(input: string): string {
  return input.replace(/[<>"]/g, '').slice(0, 500).trim();
}

function sanitizeFilename(name: string): string {
  // Strip path traversal characters, allow only safe filename chars
  return name
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\.\./g, '_')
    .slice(0, 200)
    .trim() || 'attachment';
}

function resolveExtension(filename: string, mimeType: string): string | null {
  const extFromName = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ALLOWED_EXTENSIONS.has(extFromName)) return extFromName;

  const extFromMime = MIME_TO_EXT[mimeType.toLowerCase().split(';')[0].trim()];
  if (extFromMime) return extFromMime;

  return null;
}

// ─── ZIP extraction ───────────────────────────────────────────────────────────

/**
 * Lightweight ZIP central-directory scan to list files without external deps.
 * Extracts local file entries by scanning for PK\x03\x04 local file headers.
 * Only extracts stored (compression=0) or deflated (compression=8) entries
 * that match our allowed extensions. For deflated entries we need DecompressionStream.
 */
async function extractZipEntries(zipBuffer: Buffer): Promise<Attachment[]> {
  const results: Attachment[] = [];
  const view = new DataView(zipBuffer.buffer, zipBuffer.byteOffset, zipBuffer.byteLength);

  let offset = 0;
  while (offset < zipBuffer.length - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) { offset++; continue; }

    if (offset + 30 > zipBuffer.length) break;

    const compression    = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const filenameLen    = view.getUint16(offset + 26, true);
    const extraLen       = view.getUint16(offset + 28, true);

    if (offset + 30 + filenameLen > zipBuffer.length) break;

    const filenameBytes = zipBuffer.slice(offset + 30, offset + 30 + filenameLen);
    const filename      = new TextDecoder().decode(filenameBytes);
    const dataStart     = offset + 30 + filenameLen + extraLen;
    const dataEnd       = dataStart + compressedSize;

    if (dataEnd > zipBuffer.length) break;

    const ext = resolveExtension(filename, '');
    if (ext && ext !== 'zip' && !filename.startsWith('__MACOSX')) {
      const compressedData = zipBuffer.slice(dataStart, dataEnd);
      let content: Buffer;

      if (compression === 0) {
        // Stored — no compression
        content = compressedData;
      } else if (compression === 8 && typeof DecompressionStream !== 'undefined') {
        // Deflate
        try {
          const ds     = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          const reader = ds.readable.getReader();
          writer.write(compressedData);
          writer.close();

          const chunks: Uint8Array[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          const total = chunks.reduce((n, c) => n + c.length, 0);
          const merged = new Uint8Array(total);
          let pos = 0;
          for (const chunk of chunks) { merged.set(chunk, pos); pos += chunk.length; }
          content = Buffer.from(merged);
        } catch {
          offset = dataEnd;
          continue;
        }
      } else {
        // Unsupported compression — skip
        offset = dataEnd;
        continue;
      }

      results.push({
        filename:    sanitizeFilename(filename.split('/').pop() ?? filename),
        content,
        contentType: 'application/octet-stream',
      });
    }

    offset = dataEnd;
  }

  return results;
}

// ─── Core ingest logic ────────────────────────────────────────────────────────

async function ingestEmail(email: NormalisedEmail, provider: string): Promise<{
  upload_session_id: string;
  files_processed: number;
  parsing_jobs_started: number;
  company_id: string | null;
}> {
  const db = getAdminClient();

  // ── Company lookup by ingestion email ────────────────────────────────────────
  // Both the full address "invoices@ingest.example.com" and a local-part-only
  // match (for providers that normalise the recipient) are supported.
  const recipientAddr = email.recipient.match(/<([^>]+)>/)?.[1] ?? email.recipient;

  const { data: company } = await db
    .from('companies')
    .select('id')
    .eq('ingestion_email', recipientAddr)
    .maybeSingle();

  if (!company) {
    await logEmailEvent({
      event_type:    'rejected',
      sender:        email.sender,
      recipient:     recipientAddr,
      subject:       email.subject,
      provider,
      status_code:   400,
      attachments_count: email.attachments.length,
      error_message: `No company found for ingestion email: ${recipientAddr}`,
      raw_metadata:  { reason: 'unknown_recipient' },
    });
    throw Object.assign(new Error(`No company found for ingestion email: ${recipientAddr}`), { status: 400 });
  }

  const companyId = company.id;

  // ── Flatten ZIP attachments and collect all files ─────────────────────────
  const allFiles: Attachment[] = [];

  for (const att of email.attachments) {
    const ext = resolveExtension(att.filename, att.contentType);
    if (ext === 'zip') {
      const inner = await extractZipEntries(att.content).catch(() => []);
      allFiles.push(...inner);
    } else if (ext) {
      allFiles.push(att);
    }
  }

  if (allFiles.length === 0) {
    await logEmailEvent({
      event_type:        'rejected',
      sender:            email.sender,
      recipient:         recipientAddr,
      subject:           email.subject,
      provider,
      status_code:       422,
      company_id:        companyId,
      attachments_count: email.attachments.length,
      error_message:     'No supported attachments found in email (PDF, CSV, XML, JPG, PNG, ZIP)',
      raw_metadata:      { reason: 'no_supported_attachments' },
    });
    throw Object.assign(new Error('No supported attachments found in email (PDF, CSV, XML, JPG, PNG, ZIP)'), { status: 422 });
  }

  // ── Create upload session ─────────────────────────────────────────────────
  const sessionId   = crypto.randomUUID();
  const storagePath = `companies/${companyId}/uploads/${sessionId}`;

  const { data: session, error: sessionError } = await db
    .from('upload_sessions')
    .insert({
      id:           sessionId,
      company_id:   companyId,
      user_id:      null,          // system-initiated; no authenticated user
      source:       'email',
      status:       'processing',
      file_count:   allFiles.length,
      storage_path: storagePath,
    } as never)                    // user_id nullable — cast avoids strict type mismatch
    .select('id')
    .single();

  if (sessionError || !session) {
    await logEmailEvent({
      event_type:    'error',
      sender:        email.sender,
      recipient:     recipientAddr,
      subject:       email.subject,
      provider,
      status_code:   500,
      company_id:    companyId,
      attachments_count: allFiles.length,
      error_message: `Failed to create upload session: ${sessionError?.message}`,
      raw_metadata:  { reason: 'session_creation_failed' },
    });
    throw new Error(`Failed to create upload session: ${sessionError?.message}`);
  }

  // ── Upload each file to Storage and trigger parseInvoice ─────────────────
  let filesProcessed     = 0;
  let parsingJobsStarted = 0;
  const errors: { filename: string; error: string }[] = [];

  for (const file of allFiles) {
    try {
      const storedPath = `${storagePath}/${file.filename}`;

      const { error: uploadError } = await db.storage
        .from('invoices')
        .upload(storedPath, file.content, {
          contentType: file.contentType,
          upsert:      true,
        });

      if (uploadError) {
        errors.push({ filename: file.filename, error: uploadError.message });
        continue;
      }

      filesProcessed++;

      // ── Trigger parseInvoice edge function (fire-and-forget) ──────────────
      const supabaseUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const serviceKey    = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const functionUrl   = `${supabaseUrl}/functions/v1/parseInvoice`;

      // storedPath is relative to the 'invoices' bucket — pass as storage path
      const fileUrl = `invoices/${storedPath}`;

      fetch(functionUrl, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'Apikey':        serviceKey,
        },
        body: JSON.stringify({
          fileUrl,
          uploadSessionId: sessionId,
          companyId,
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const detail = await res.text().catch(() => '');
            console.error(`[email-ingest] parseInvoice failed for ${file.filename}:`, res.status, detail.slice(0, 200));
          }
        })
        .catch((err) => {
          console.error(`[email-ingest] parseInvoice fetch error for ${file.filename}:`, err);
        });

      parsingJobsStarted++;
    } catch (err) {
      errors.push({
        filename: file.filename,
        error:    err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  // ── Update session status ─────────────────────────────────────────────────
  const finalStatus = filesProcessed === 0 ? 'failed' : 'processing';
  await db.from('upload_sessions').update({
    status:      finalStatus,
    error_count: errors.length,
    error_detail: errors as unknown as never,
  }).eq('id', sessionId);

  // ── Log successful ingestion to email_events ──────────────────────────────
  await logEmailEvent({
    event_type:        'processed',
    sender:            email.sender,
    recipient:         recipientAddr,
    subject:           email.subject,
    provider,
    status_code:       200,
    company_id:        companyId,
    upload_session_id: sessionId,
    attachments_count: allFiles.length,
    files_processed:   filesProcessed,
    error_message:     errors.length > 0 ? `${errors.length} file(s) failed` : null,
    raw_metadata:      { parsing_jobs_started: parsingJobsStarted, errors },
  });

  // ── Audit log ─────────────────────────────────────────────────────────────
  await db.from('audit_logs').insert({
    company_id: companyId,
    user_id:    '00000000-0000-0000-0000-000000000000', // system sentinel UUID
    invoice_id: null,
    action:     'email_ingest',
    metadata:   {
      sender:          email.sender,
      recipient:       recipientAddr,
      subject:         email.subject,
      files_processed: filesProcessed,
      parsing_started: parsingJobsStarted,
      errors,
    },
  } as never);

  return {
    upload_session_id:    sessionId,
    files_processed:      filesProcessed,
    parsing_jobs_started: parsingJobsStarted,
    company_id:           companyId,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let provider = 'unknown';
  let parsedEmail: NormalisedEmail | null = null;

  try {
    const contentType = req.headers.get('content-type') ?? '';
    const rawBody     = await req.text();

    // ── Determine provider and validate signature ──────────────────────────
    const mailgunKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
    const resendKey  = process.env.RESEND_WEBHOOK_SECRET;

    const svixId        = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');

    const isResendWebhook  = !!(svixId && svixTimestamp && svixSignature);
    const isMailgunWebhook = !isResendWebhook;

    provider = isResendWebhook ? 'resend' : 'mailgun';

    if (isResendWebhook) {
      if (!resendKey) {
        console.warn('[email-ingest] RESEND_WEBHOOK_SECRET not configured — skipping signature check');
      } else {
        const valid = verifyResendSignature(resendKey, svixId!, svixTimestamp!, svixSignature!, rawBody);
        if (!valid) {
          await logEmailEvent({
            event_type:  'rejected',
            provider,
            status_code: 401,
            error_message: 'Invalid webhook signature',
            raw_metadata: { reason: 'invalid_signature' },
          });
          return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
        }
      }
    } else {
      if (!mailgunKey) {
        console.warn('[email-ingest] MAILGUN_WEBHOOK_SIGNING_KEY not configured — skipping signature check');
      } else {
        // Signature fields are in the form body — we need to parse them
        const tempForm = new URLSearchParams(rawBody);
        const timestamp = tempForm.get('timestamp') ?? '';
        const token     = tempForm.get('token')     ?? '';
        const signature = tempForm.get('signature') ?? '';

        if (!timestamp || !token || !signature) {
          await logEmailEvent({
            event_type:  'rejected',
            provider,
            status_code: 400,
            error_message: 'Missing Mailgun signature fields',
            raw_metadata: { reason: 'missing_signature_fields' },
          });
          return NextResponse.json({ error: 'Missing Mailgun signature fields' }, { status: 400 });
        }

        // Reject stale timestamps (>5 minutes)
        const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
        if (age > 300) {
          await logEmailEvent({
            event_type:  'rejected',
            provider,
            status_code: 401,
            error_message: 'Webhook timestamp too old',
            raw_metadata: { reason: 'stale_timestamp', age_seconds: age },
          });
          return NextResponse.json({ error: 'Webhook timestamp too old' }, { status: 401 });
        }

        const valid = verifyMailgunSignature(mailgunKey, timestamp, token, signature);
        if (!valid) {
          await logEmailEvent({
            event_type:  'rejected',
            provider,
            status_code: 401,
            error_message: 'Invalid webhook signature',
            raw_metadata: { reason: 'invalid_signature' },
          });
          return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
        }
      }
    }

    // ── Parse payload into normalised email ────────────────────────────────
    let email: NormalisedEmail;

    if (isResendWebhook) {
      const json = JSON.parse(rawBody) as Record<string, unknown>;
      email = await parseResendPayload(json);
    } else {
      // Reconstruct FormData from the raw body for Mailgun multipart parsing
      const form = await new Request(req.url, {
        method:  'POST',
        headers: { 'content-type': contentType },
        body:    rawBody,
      }).formData();
      email = await parseMailgunPayload(form);
    }

    parsedEmail = email;

    if (!email.recipient) {
      await logEmailEvent({
        event_type:  'rejected',
        sender:      email.sender,
        subject:     email.subject,
        provider,
        status_code: 400,
        error_message: 'Could not determine recipient address',
        raw_metadata: { reason: 'missing_recipient' },
      });
      return NextResponse.json({ error: 'Could not determine recipient address' }, { status: 400 });
    }

    // ── Log received event ─────────────────────────────────────────────────
    await logEmailEvent({
      event_type:        'received',
      sender:            email.sender,
      recipient:         email.recipient,
      subject:           email.subject,
      provider,
      attachments_count: email.attachments.length,
      raw_metadata:      { has_attachments: email.attachments.length > 0 },
    });

    // ── Run ingest ─────────────────────────────────────────────────────────
    const result = await ingestEmail(email, provider);

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const status  = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[email-ingest]', err);

    await logEmailEvent({
      event_type:    status >= 500 ? 'error' : 'rejected',
      sender:        parsedEmail?.sender,
      recipient:     parsedEmail?.recipient,
      subject:       parsedEmail?.subject,
      provider,
      status_code:   status,
      attachments_count: parsedEmail?.attachments.length ?? 0,
      error_message: message,
    });

    return NextResponse.json({ error: message }, { status });
  }
}

// GET handler — health check for the ingestion endpoint
export async function GET() {
  return NextResponse.json({
    status:     'ok',
    endpoint:   '/api/email-ingest',
    methods:    ['POST'],
    providers:  ['mailgun', 'resend'],
    description: 'Incoming email ingestion webhook. Accepts forwarded emails from Mailgun or Resend.',
  });
}
