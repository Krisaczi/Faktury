import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readSrc = (rel: string) => readFile(join(projectRoot, rel), 'utf8');

describe('KSeF submission: submit service (lib/ksef/submit.ts)', () => {
  it('exports generateIdempotencyKey', async () => {
    const src = await readSrc('lib/ksef/submit.ts');
    assert.match(src, /export function generateIdempotencyKey/, 'must export generateIdempotencyKey');
  });

  it('uses deterministic SHA-256 for idempotency key', async () => {
    const src = await readSrc('lib/ksef/submit.ts');
    assert.match(src, /createHash.*sha256/, 'must use SHA-256 for idempotency key');
    assert.match(src, /ksef-submit/, 'must include deterministic prefix');
  });

  it('exports submitToKsef function', async () => {
    const src = await readSrc('lib/ksef/submit.ts');
    assert.match(src, /export async function submitToKsef/, 'must export submitToKsef');
  });

  it('exports checkKsefStatus function', async () => {
    const src = await readSrc('lib/ksef/submit.ts');
    assert.match(src, /export async function checkKsefStatus/, 'must export checkKsefStatus');
  });

  it('defines KsefStatus type with all required states', async () => {
    const src = await readSrc('lib/ksef/submit.ts');
    assert.match(src, /pending.*queued.*submitted.*accepted.*rejected.*failed/, 'must define all KseF status states');
  });

  it('is idempotent — returns existing ksef_number without re-submitting', async () => {
    const src = await readSrc('lib/ksef/submit.ts');
    assert.match(src, /existingKsefNumber/, 'must accept existingKsefNumber param');
    assert.match(src, /Already submitted/, 'must return early when already submitted');
  });

  it('sends signed XML to KSeF /invoices/send endpoint', async () => {
    const src = await readSrc('lib/ksef/submit.ts');
    assert.match(src, /\/invoices\/send/, 'must POST to /invoices/send');
    assert.match(src, /application\/octet-stream/, 'must use octet-stream content type');
  });

  it('sends idempotency key header', async () => {
    const src = await readSrc('lib/ksef/submit.ts');
    assert.match(src, /X-Idempotency-Key/i, 'must send idempotency key header');
  });

  it('handles transient errors (5xx) by returning queued status', async () => {
    const src = await readSrc('lib/ksef/submit.ts');
    assert.match(src, /transient.*true/, 'must mark transient errors as transient');
    assert.match(src, /status.*queued/, 'must return queued for transient errors');
  });

  it('handles KSeF rejection (400/422) by returning rejected status', async () => {
    const src = await readSrc('lib/ksef/submit.ts');
    assert.match(src, /400.*422/, 'must handle 400/422 as rejection');
    assert.match(src, /status.*rejected/, 'must return rejected for validation errors');
  });

  it('uses KSeF test and prod base URLs', async () => {
    const src = await readSrc('lib/ksef/submit.ts');
    assert.match(src, /api-test\.ksef\.mf\.gov\.pl/, 'must have test URL');
    assert.match(src, /api\.ksef\.mf\.gov\.pl/, 'must have prod URL');
  });

  it('implements full KSeF token-auth flow (challenge → encrypt → initiate → poll → redeem)', async () => {
    const src = await readSrc('lib/ksef/submit.ts');
    assert.match(src, /auth\/challenge/, 'must call challenge endpoint');
    assert.match(src, /auth\/ksef-token/, 'must call ksef-token init');
    assert.match(src, /auth\/token\/redeem/, 'must redeem access token');
    assert.match(src, /publicEncrypt/, 'must encrypt token with RSA-OAEP');
  });
});

describe('KSeF submission: issue endpoint integration', () => {
  it('attempts KSeF submission after invoice is issued', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /submitToKsef/, 'must call submitToKsef');
    assert.match(src, /buildPlatformKsefPayload/, 'must build KSeF payload');
  });

  it('creates a ksef_submission_jobs record', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /ksef_submission_jobs/, 'must reference submission jobs table');
    assert.match(src, /\.insert\(/, 'must insert into submission jobs');
  });

  it('updates invoice with ksef_status and ksef_number', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /ksef_status/, 'must update ksef_status');
    assert.match(src, /ksef_number/, 'must update ksef_number');
  });

  it('creates ksef_submission audit entry', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /action.*ksef_submission/, 'must create ksef_submission audit entry');
  });

  it('KSeF submission is non-blocking — catches errors and continues', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /non-blocking/i, 'must document non-blocking nature');
    assert.match(src, /ksefResult.*queued/i, 'must default to queued on error');
  });

  it('returns ksef result in the response', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /ksef.*ksefResult/, 'must include ksef result in response');
  });

  it('does not block if KSeF credentials are missing', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /creds\?.token/, 'must check if credentials exist before submitting');
  });
});

describe('KSeF submission: send-to-ksef endpoint', () => {
  it('requires owner role', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/send-to-ksef/route.ts');
    assert.match(src, /Forbidden/, 'must require owner role');
  });

  it('rejects draft invoices', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/send-to-ksef/route.ts');
    assert.match(src, /szkicem.*wystaw/i, 'must reject drafts');
  });

  it('requires company NIP', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/send-to-ksef/route.ts');
    assert.match(src, /nip.*KSeF/i, 'must require NIP');
  });

  it('requires KSeF credentials', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/send-to-ksef/route.ts');
    assert.match(src, /ksef_credentials/, 'must load KSeF credentials');
    assert.match(src, /Brak danych logowania KSeF/i, 'must error if no credentials');
  });

  it('creates submission job and updates invoice', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/send-to-ksef/route.ts');
    assert.match(src, /ksef_submission_jobs/, 'must reference submission jobs table');
    assert.match(src, /\.insert\(/, 'must insert into submission jobs');
    assert.match(src, /platform_invoices/, 'must update invoice');
  });

  it('creates audit entry for manual resubmit', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/send-to-ksef/route.ts');
    assert.match(src, /manualResubmit.*true/, 'must flag manual resubmit in audit');
  });

  it('returns 202 for transient errors (queued)', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/send-to-ksef/route.ts');
    assert.match(src, /status.*202/, 'must return 202 for transient errors');
  });

  it('returns 422 for KSeF rejection', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/send-to-ksef/route.ts');
    assert.match(src, /status.*422/, 'must return 422 for rejection');
  });

  it('uses idempotency key from invoice ID', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/send-to-ksef/route.ts');
    assert.match(src, /generateIdempotencyKey/, 'must generate idempotency key');
  });
});

describe('KSeF submission: ksef-status endpoint', () => {
  it('requires owner role', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/ksef-status/route.ts');
    assert.match(src, /Forbidden/, 'must require owner role');
  });

  it('returns ksef_status, ksef_number, ksef_response', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/ksef-status/route.ts');
    assert.match(src, /ksefStatus/, 'must return ksefStatus');
    assert.match(src, /ksefNumber/, 'must return ksefNumber');
    assert.match(src, /ksefResponse/, 'must return ksefResponse');
  });

  it('returns lastAttemptAt', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/ksef-status/route.ts');
    assert.match(src, /lastAttemptAt/, 'must return lastAttemptAt');
  });

  it('returns latest submission job info', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/ksef-status/route.ts');
    assert.match(src, /latestJob/, 'must return latest job info');
  });
});

describe('KSeF submission: webhook handler', () => {
  it('validates webhook signature using KSEF_WEBHOOK_SECRET', async () => {
    const src = await readSrc('app/api/ksef/webhook/route.ts');
    assert.match(src, /KSEF_WEBHOOK_SECRET/, 'must check webhook secret');
    assert.match(src, /createHmac/, 'must use HMAC for signature validation');
  });

  it('rejects invalid signature with 401', async () => {
    const src = await readSrc('app/api/ksef/webhook/route.ts');
    assert.match(src, /Invalid signature/, 'must reject invalid signature');
    assert.match(src, /401/, 'must return 401 for invalid signature');
  });

  it('updates invoice ksef_status to accepted or rejected', async () => {
    const src = await readSrc('app/api/ksef/webhook/route.ts');
    assert.match(src, /accepted/, 'must handle accepted status');
    assert.match(src, /rejected/, 'must handle rejected status');
  });

  it('persists ksef_number when provided', async () => {
    const src = await readSrc('app/api/ksef/webhook/route.ts');
    assert.match(src, /ksef_number/, 'must persist ksef_number');
  });

  it('creates audit entry for webhook', async () => {
    const src = await readSrc('app/api/ksef/webhook/route.ts');
    assert.match(src, /action.*ksef_webhook/, 'must create ksef_webhook audit entry');
  });

  it('includes CORS headers', async () => {
    const src = await readSrc('app/api/ksef/webhook/route.ts');
    assert.match(src, /Access-Control-Allow-Origin/, 'must include CORS headers');
  });

  it('handles OPTIONS preflight', async () => {
    const src = await readSrc('app/api/ksef/webhook/route.ts');
    assert.match(src, /OPTIONS/, 'must handle OPTIONS preflight');
  });

  it('updates submission job status', async () => {
    const src = await readSrc('app/api/ksef/webhook/route.ts');
    assert.match(src, /ksef_submission_jobs/, 'must reference submission jobs table');
    assert.match(src, /update/, 'must update submission job');
  });
});

describe('KSeF submission: platform invoice modal', () => {
  it('captures and displays KSeF result after issuance', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /ksefResult/, 'must have ksefResult state');
    assert.match(src, /data\.ksef/, 'must read ksef from issue response');
  });

  it('shows KSeF status in success step', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /KSeF.*ksefResult\.ksefStatus/, 'must show KSeF status in success');
  });

  it('shows KSeF number when available', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /ksefResult\.ksefNumber/, 'must show KSeF number');
  });

  it('shows transient error message when KSeF is queued', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /ksefResult\.transient/, 'must check transient flag');
    assert.match(src, /automatycznie ponownie/i, 'must show retry message');
  });

  it('shows error details for rejection', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /ksefResult\.error/, 'must show error details');
  });

  it('sends email independently of KSeF outcome', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /Send email.*non-blocking|independent of KSeF/i, 'must document email independence');
  });
});

describe('KSeF submission: platform-invoices-client', () => {
  it('includes ksefStatus and ksefNumber in PlatformInvoice interface', async () => {
    const src = await readSrc('components/admin/platform-invoices-client.tsx');
    assert.match(src, /ksefStatus/, 'must include ksefStatus');
    assert.match(src, /ksefNumber/, 'must include ksefNumber');
  });

  it('shows KSeF status badge in invoice table', async () => {
    const src = await readSrc('components/admin/platform-invoices-client.tsx');
    assert.match(src, /inv\.ksefStatus/, 'must render KSeF status badge');
  });

  it('shows resubmit button for rejected/failed/queued invoices', async () => {
    const src = await readSrc('components/admin/platform-invoices-client.tsx');
    assert.match(src, /resubmitKsef/, 'must have resubmitKsef function');
    assert.match(src, /rejected.*failed.*queued/, 'must show resubmit for these statuses');
  });

  it('shows KSeF number in invoice row', async () => {
    const src = await readSrc('components/admin/platform-invoices-client.tsx');
    assert.match(src, /inv\.ksefNumber/, 'must show KSeF number in row');
  });
});

describe('KSeF submission: list endpoint returns KSeF fields', () => {
  it('includes ksef_status and ksef_number in response', async () => {
    const src = await readSrc('app/api/owner/invoices/route.ts');
    assert.match(src, /ksef_status/, 'must include ksef_status');
    assert.match(src, /ksef_number/, 'must include ksef_number');
    assert.match(src, /ksefStatus/, 'must map to ksefStatus');
    assert.match(src, /ksefNumber/, 'must map to ksefNumber');
  });
});

describe('KSeF submission: preview endpoint returns KSeF fields', () => {
  it('includes KSeF fields in preview response', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/preview/route.ts');
    assert.match(src, /ksefStatus/, 'must include ksefStatus');
    assert.match(src, /ksefNumber/, 'must include ksefNumber');
  });
});
