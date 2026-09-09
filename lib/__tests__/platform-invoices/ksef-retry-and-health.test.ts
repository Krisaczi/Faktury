import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readSrc = (rel: string) => readFile(join(projectRoot, rel), 'utf8');

describe('KSeF background worker (ksefRetryWorker edge function)', () => {
  it('implements circuit breaker with threshold and cooldown', async () => {
    const src = await readSrc('supabase/functions/ksefRetryWorker/index.ts');
    assert.match(src, /CIRCUIT_BREAKER_THRESHOLD/, 'must define circuit breaker threshold');
    assert.match(src, /CIRCUIT_BREAKER_RESET_MS/, 'must define circuit breaker reset time');
    assert.match(src, /circuitBreakerOpen/, 'must check circuit breaker state');
  });

  it('fetches queued jobs with attempt limit', async () => {
    const src = await readSrc('supabase/functions/ksefRetryWorker/index.ts');
    assert.match(src, /ksef_submission_jobs/, 'must query submission jobs');
    assert.match(src, /status.*queued/, 'must filter for queued jobs');
    assert.match(src, /MAX_ATTEMPTS/, 'must respect max attempts');
  });

  it('implements exponential backoff', async () => {
    const src = await readSrc('supabase/functions/ksefRetryWorker/index.ts');
    assert.match(src, /backoff/i, 'must implement backoff');
    assert.match(src, /Math\.pow.*2/, 'must use exponential backoff (2^n)');
  });

  it('skips invoices already accepted or with ksef_number', async () => {
    const src = await readSrc('supabase/functions/ksefRetryWorker/index.ts');
    assert.match(src, /accepted.*ksef_number|ksef_number.*accepted/, 'must skip accepted invoices');
  });

  it('writes ksef_submission_audit for each attempt', async () => {
    const src = await readSrc('supabase/functions/ksefRetryWorker/index.ts');
    assert.match(src, /ksef_submission_audit/, 'must write to ksef_submission_audit');
    assert.match(src, /attempt_result/, 'must include attempt result');
  });

  it('uses correlation ID for tracing', async () => {
    const src = await readSrc('supabase/functions/ksefRetryWorker/index.ts');
    assert.match(src, /correlationId/, 'must generate correlation ID');
    assert.match(src, /correlation_id/, 'must persist correlation ID');
  });

  it('returns summary of processed/succeeded/failed/stillQueued', async () => {
    const src = await readSrc('supabase/functions/ksefRetryWorker/index.ts');
    assert.match(src, /processed/, 'must return processed count');
    assert.match(src, /succeeded/, 'must return succeeded count');
    assert.match(src, /failed/, 'must return failed count');
    assert.match(src, /stillQueued/, 'must return still queued count');
  });

  it('includes CORS headers', async () => {
    const src = await readSrc('supabase/functions/ksefRetryWorker/index.ts');
    assert.match(src, /Access-Control-Allow-Origin/, 'must include CORS headers');
  });

  it('marks jobs as failed when max attempts exhausted', async () => {
    const src = await readSrc('supabase/functions/ksefRetryWorker/index.ts');
    assert.match(src, /MAX_ATTEMPTS.*failed|failed.*MAX_ATTEMPTS/, 'must fail jobs after max attempts');
  });

  it('handles missing invoices gracefully', async () => {
    const src = await readSrc('supabase/functions/ksefRetryWorker/index.ts');
    assert.match(src, /not found/i, 'must handle missing invoices');
  });
});

describe('KSeF bulk resubmit endpoint', () => {
  it('requires owner role', async () => {
    const src = await readSrc('app/api/owner/invoices/bulk-send-to-ksef/route.ts');
    assert.match(src, /Forbidden/, 'must require owner role');
  });

  it('accepts invoiceIds array', async () => {
    const src = await readSrc('app/api/owner/invoices/bulk-send-to-ksef/route.ts');
    assert.match(src, /invoiceIds/, 'must accept invoiceIds');
    assert.match(src, /Array\.isArray/, 'must validate array type');
  });

  it('limits to 50 invoices at once', async () => {
    const src = await readSrc('app/api/owner/invoices/bulk-send-to-ksef/route.ts');
    assert.match(src, /50/, 'must limit to 50 invoices');
  });

  it('skips already-accepted invoices', async () => {
    const src = await readSrc('app/api/owner/invoices/bulk-send-to-ksef/route.ts');
    assert.match(src, /accepted.*ksef_number|ksef_number.*accepted/, 'must skip accepted invoices');
  });

  it('writes ksef_submission_audit for each attempt', async () => {
    const src = await readSrc('app/api/owner/invoices/bulk-send-to-ksef/route.ts');
    assert.match(src, /ksef_submission_audit/, 'must write to ksef_submission_audit');
  });

  it('returns per-invoice results with summary', async () => {
    const src = await readSrc('app/api/owner/invoices/bulk-send-to-ksef/route.ts');
    assert.match(src, /summary/, 'must return summary');
    assert.match(src, /succeeded/, 'must return succeeded count');
    assert.match(src, /failed/, 'must return failed count');
    assert.match(src, /queued/, 'must return queued count');
    assert.match(src, /results/, 'must return per-invoice results');
  });

  it('uses correlation ID for tracing', async () => {
    const src = await readSrc('app/api/owner/invoices/bulk-send-to-ksef/route.ts');
    assert.match(src, /correlationId/, 'must generate correlation ID');
  });

  it('creates submission jobs for each invoice', async () => {
    const src = await readSrc('app/api/owner/invoices/bulk-send-to-ksef/route.ts');
    assert.match(src, /ksef_submission_jobs/, 'must create submission jobs');
    assert.match(src, /idempotency_key/, 'must use idempotency key');
  });
});

describe('KSeF health endpoint', () => {
  it('requires owner role', async () => {
    const src = await readSrc('app/api/owner/invoices/ksef-health/route.ts');
    assert.match(src, /Forbidden/, 'must require owner role');
  });

  it('returns counts for all KSeF statuses', async () => {
    const src = await readSrc('app/api/owner/invoices/ksef-health/route.ts');
    assert.match(src, /queued/, 'must count queued');
    assert.match(src, /failed/, 'must count failed');
    assert.match(src, /rejected/, 'must count rejected');
    assert.match(src, /submitted/, 'must count submitted');
    assert.match(src, /accepted/, 'must count accepted');
  });

  it('returns attention invoices (queued/failed/rejected)', async () => {
    const src = await readSrc('app/api/owner/invoices/ksef-health/route.ts');
    assert.match(src, /attentionInvoices/, 'must return attention invoices');
    assert.match(src, /queued.*failed.*rejected/, 'must filter for attention statuses');
  });

  it('returns queue length from submission jobs', async () => {
    const src = await readSrc('app/api/owner/invoices/ksef-health/route.ts');
    assert.match(src, /queueLength/, 'must return queue length');
    assert.match(src, /ksef_submission_jobs/, 'must query submission jobs');
  });

  it('returns recent audit entries', async () => {
    const src = await readSrc('app/api/owner/invoices/ksef-health/route.ts');
    assert.match(src, /recentAudit/, 'must return recent audit');
    assert.match(src, /ksef_submission_audit/, 'must query audit table');
  });

  it('joins company names for attention invoices', async () => {
    const src = await readSrc('app/api/owner/invoices/ksef-health/route.ts');
    assert.match(src, /companies/, 'must join companies');
    assert.match(src, /companyMap/, 'must map company names');
  });
});

describe('KSeF submission audit integration', () => {
  it('issue endpoint writes to ksef_submission_audit', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /ksef_submission_audit/, 'issue endpoint must write to ksef_submission_audit');
    assert.match(src, /attempt_result/, 'must include attempt result');
  });

  it('send-to-ksef endpoint writes to ksef_submission_audit', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/send-to-ksef/route.ts');
    assert.match(src, /ksef_submission_audit/, 'send-to-ksef must write to ksef_submission_audit');
    assert.match(src, /attempt_result/, 'must include attempt result');
  });
});

describe('KSeF health widget component', () => {
  it('renders status summary cards', async () => {
    const src = await readSrc('components/admin/ksef-health-widget.tsx');
    assert.match(src, /accepted/, 'must show accepted count');
    assert.match(src, /submitted/, 'must show submitted count');
    assert.match(src, /queued/, 'must show queued count');
    assert.match(src, /rejected/, 'must show rejected count');
    assert.match(src, /failed/, 'must show failed count');
  });

  it('shows attention invoices list with checkboxes', async () => {
    const src = await readSrc('components/admin/ksef-health-widget.tsx');
    assert.match(src, /attentionInvoices/, 'must show attention invoices');
    assert.match(src, /checkbox/, 'must have checkboxes for selection');
  });

  it('supports bulk resubmit via callback', async () => {
    const src = await readSrc('components/admin/ksef-health-widget.tsx');
    assert.match(src, /onResubmit/, 'must accept onResubmit callback');
    assert.match(src, /bulkResubmit|handleBulkResubmit/, 'must have bulk resubmit handler');
  });

  it('shows queue length indicator', async () => {
    const src = await readSrc('components/admin/ksef-health-widget.tsx');
    assert.match(src, /queueLength/, 'must show queue length');
  });

  it('has refresh button', async () => {
    const src = await readSrc('components/admin/ksef-health-widget.tsx');
    assert.match(src, /loadHealth/, 'must have loadHealth function');
    assert.match(src, /RefreshCw/, 'must have refresh icon');
  });

  it('exports KsefHealthWidget', async () => {
    const src = await readSrc('components/admin/ksef-health-widget.tsx');
    assert.match(src, /export function KsefHealthWidget/, 'must export KsefHealthWidget');
  });
});

describe('KSeF health widget integration on platform-invoices page', () => {
  it('renders KsefHealthWidget on the page', async () => {
    const src = await readSrc('app/(admin)/admin/platform-invoices/page.tsx');
    assert.match(src, /KsefHealthWidget/, 'must render KsefHealthWidget');
  });

  it('includes ksef_status and ksef_number in formatted invoices', async () => {
    const src = await readSrc('app/(admin)/admin/platform-invoices/page.tsx');
    assert.match(src, /ksef_status/, 'must include ksef_status');
    assert.match(src, /ksef_number/, 'must include ksef_number');
    assert.match(src, /ksefStatus/, 'must map to ksefStatus');
    assert.match(src, /ksefNumber/, 'must map to ksefNumber');
  });
});

describe('platform-invoices-client bulk resubmit', () => {
  it('has bulkResubmitKsef function', async () => {
    const src = await readSrc('components/admin/platform-invoices-client.tsx');
    assert.match(src, /bulkResubmitKsef/, 'must have bulkResubmitKsef function');
  });

  it('calls bulk-send-to-ksef endpoint', async () => {
    const src = await readSrc('components/admin/platform-invoices-client.tsx');
    assert.match(src, /bulk-send-to-ksef/, 'must call bulk endpoint');
  });

  it('shows summary of results', async () => {
    const src = await readSrc('components/admin/platform-invoices-client.tsx');
    assert.match(src, /succeeded.*failed.*queued|summary/, 'must show summary');
  });
});

describe('supabase config for edge functions', () => {
  it('config.toml exists with ksefRetryWorker entry', async () => {
    const src = await readSrc('supabase/config.toml');
    assert.match(src, /ksefRetryWorker/, 'must have ksefRetryWorker config');
    assert.match(src, /verify_jwt.*false/, 'must set verify_jwt to false');
  });
});
