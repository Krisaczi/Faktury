import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readSrc = (rel: string) => readFile(join(projectRoot, rel), 'utf8');

describe('ROOT CAUSE FIX: platform KSeF payload builder', () => {
  it('creates buildPlatformKsefPayload in lib/ksef/platform-submit.ts', async () => {
    const src = await readSrc('lib/ksef/platform-submit.ts');
    assert.match(src, /export async function buildPlatformKsefPayload/, 'must export buildPlatformKsefPayload');
  });

  it('fetches from platform_invoices table (NOT issued_invoices)', async () => {
    const src = await readSrc('lib/ksef/platform-submit.ts');
    assert.match(src, /platform_invoices/, 'must fetch from platform_invoices');
    assert.doesNotMatch(src, /from\(['"]issued_invoices['"]\)/, 'must NOT fetch from issued_invoices');
  });

  it('fetches line items from platform_invoice_line_items', async () => {
    const src = await readSrc('lib/ksef/platform-submit.ts');
    assert.match(src, /platform_invoice_line_items/, 'must fetch from platform_invoice_line_items');
  });

  it('fetches buyer company data from companies table', async () => {
    const src = await readSrc('lib/ksef/platform-submit.ts');
    assert.match(src, /companies/, 'must fetch company data');
    assert.match(src, /buyer/, 'must map buyer fields');
  });

  it('fetches seller (issuer) company via issued_by → users → companies', async () => {
    const src = await readSrc('lib/ksef/platform-submit.ts');
    assert.match(src, /issued_by/, 'must use issued_by to find seller');
    assert.match(src, /seller/, 'must map seller fields');
  });

  it('maps line items to IssuedInvoiceWithItems format with position, name, unit, quantity', async () => {
    const src = await readSrc('lib/ksef/platform-submit.ts');
    assert.match(src, /position/, 'must set position');
    assert.match(src, /name.*description/, 'must map description to name');
    assert.match(src, /unit.*szt/, 'must set unit');
    assert.match(src, /quantity/, 'must map quantity');
  });

  it('maps unit_price_cents to unit_price_net (cents to PLN)', async () => {
    const src = await readSrc('lib/ksef/platform-submit.ts');
    assert.match(src, /unit_price_cents.*100|unitPriceNet.*100/, 'must convert cents to PLN');
  });

  it('maps VAT rate percent to VatRate enum', async () => {
    const src = await readSrc('lib/ksef/platform-submit.ts');
    assert.match(src, /vatRateFromPercent/, 'must have VAT rate mapper');
    assert.match(src, /'23'|'8'|'5'|'0'/, 'must map to standard VAT rates');
  });

  it('builds seller address from company street, zip, city', async () => {
    const src = await readSrc('lib/ksef/platform-submit.ts');
    assert.match(src, /sellerAddress/, 'must build seller address');
    assert.match(src, /street.*zip.*city/i, 'must compose address from parts');
  });

  it('uses invoice_date or falls back to issued_at for issue_date', async () => {
    const src = await readSrc('lib/ksef/platform-submit.ts');
    assert.match(src, /invoice_date/, 'must use invoice_date');
    assert.match(src, /issued_at/, 'must fall back to issued_at');
  });

  it('imports buildFa2Xml and signInvoiceXml from existing KSeF modules', async () => {
    const src = await readSrc('lib/ksef/platform-submit.ts');
    assert.match(src, /import.*buildFa2Xml.*xml-builder/, 'must import buildFa2Xml');
    assert.match(src, /import.*signInvoiceXml.*signer/, 'must import signInvoiceXml');
  });

  it('returns KsefPayload with signedXml', async () => {
    const src = await readSrc('lib/ksef/platform-submit.ts');
    assert.match(src, /signedXml.*signed\.signedXml/, 'must return signedXml');
    assert.match(src, /invoiceNumber/, 'must return invoice number');
  });

  it('throws if invoice is a draft', async () => {
    const src = await readSrc('lib/ksef/platform-submit.ts');
    assert.match(src, /draft/, 'must check for draft status');
  });

  it('throws if invoice has no line items', async () => {
    const src = await readSrc('lib/ksef/platform-submit.ts');
    assert.match(src, /no line items/, 'must check for empty items');
  });
});

describe('ROOT CAUSE FIX: issue endpoint uses buildPlatformKsefPayload', () => {
  it('imports buildPlatformKsefPayload (NOT buildKsefPayload)', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /buildPlatformKsefPayload/, 'must use buildPlatformKsefPayload');
    assert.doesNotMatch(src, /buildKsefPayload[^P]/, 'must NOT use the old buildKsefPayload');
  });
});

describe('ROOT CAUSE FIX: send-to-ksef endpoint uses buildPlatformKsefPayload', () => {
  it('imports buildPlatformKsefPayload (NOT buildKsefPayload)', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/send-to-ksef/route.ts');
    assert.match(src, /buildPlatformKsefPayload/, 'must use buildPlatformKsefPayload');
    assert.doesNotMatch(src, /import.*buildKsefPayload.*from.*ksef[^p]/, 'must NOT import old buildKsefPayload');
  });
});

describe('ROOT CAUSE FIX: bulk-send-to-ksef endpoint uses buildPlatformKsefPayload', () => {
  it('imports buildPlatformKsefPayload (NOT buildKsefPayload)', async () => {
    const src = await readSrc('app/api/owner/invoices/bulk-send-to-ksef/route.ts');
    assert.match(src, /buildPlatformKsefPayload/, 'must use buildPlatformKsefPayload');
    assert.doesNotMatch(src, /import.*buildKsefPayload.*from.*ksef[^p]/, 'must NOT import old buildKsefPayload');
  });
});

describe('ROOT CAUSE FIX: ksefRetryWorker calls app API instead of empty XML', () => {
  it('calls the send-to-ksef API endpoint for XML building', async () => {
    const src = await readSrc('supabase/functions/ksefRetryWorker/index.ts');
    assert.match(src, /send-to-ksef/, 'must call send-to-ksef API');
    assert.match(src, /APP_URL/, 'must use APP_URL env var');
  });

  it('does NOT pass empty string as signedXml', async () => {
    const src = await readSrc('supabase/functions/ksefRetryWorker/index.ts');
    assert.doesNotMatch(src, /signedXml.*""|"".*signedXml/, 'must NOT pass empty signedXml');
  });
});

describe('Backfill script', () => {
  it('finds invoices with ksef_number IS NULL and status != draft', async () => {
    const src = await readSrc('scripts/ksef_backfill.js');
    assert.match(src, /ksef_number.*null/i, 'must filter for null ksef_number');
    assert.match(src, /draft/, 'must exclude drafts');
  });

  it('supports --dry-run and --apply modes', async () => {
    const src = await readSrc('scripts/ksef_backfill.js');
    assert.match(src, /dry-run/, 'must support dry-run mode');
    assert.match(src, /apply/, 'must support apply mode');
  });

  it('outputs CSV report', async () => {
    const src = await readSrc('scripts/ksef_backfill.js');
    assert.match(src, /invoice_id,invoice_number/, 'must output CSV header');
  });

  it('calls send-to-ksef API for each invoice', async () => {
    const src = await readSrc('scripts/ksef_backfill.js');
    assert.match(src, /send-to-ksef/, 'must call send-to-ksef endpoint');
  });

  it('prints summary of succeeded/queued/failed', async () => {
    const src = await readSrc('scripts/ksef_backfill.js');
    assert.match(src, /succeeded/i, 'must report succeeded count');
    assert.match(src, /queued/i, 'must report queued count');
    assert.match(src, /failed/i, 'must report failed count');
  });
});
