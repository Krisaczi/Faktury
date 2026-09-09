import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readSrc = (rel: string) => readFile(join(projectRoot, rel), 'utf8');

describe('manual invoice number and date — draft endpoint', () => {
  it('accepts invoiceNumber, invoiceDate, and autoGenerateNumber in schema', async () => {
    const src = await readSrc('app/api/owner/invoices/draft/route.ts');
    assert.match(src, /invoiceNumber/, 'schema must include invoiceNumber');
    assert.match(src, /invoiceDate/, 'schema must include invoiceDate');
    assert.match(src, /autoGenerateNumber/, 'schema must include autoGenerateNumber');
  });

  it('stores invoice_number and invoice_date in the insert', async () => {
    const src = await readSrc('app/api/owner/invoices/draft/route.ts');
    assert.match(src, /invoice_number:/, 'insert must include invoice_number');
    assert.match(src, /invoice_date:/, 'insert must include invoice_date');
  });

  it('validates manual invoice number uniqueness before insert', async () => {
    const src = await readSrc('app/api/owner/invoices/draft/route.ts');
    assert.match(src, /invoice_number.*invoiceNumber/, 'must check existing invoice_number');
    assert.match(src, /409/, 'must return 409 for duplicate');
  });

  it('does not assign auto-generated number on draft (only manual if provided)', async () => {
    const src = await readSrc('app/api/owner/invoices/draft/route.ts');
    assert.doesNotMatch(src, /generate_platform_invoice_number/, 'must NOT auto-generate number on draft');
  });
});

describe('manual invoice number and date — issue endpoint', () => {
  it('accepts invoiceNumber, invoiceDate, autoGenerateNumber from request body', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /body\.invoiceNumber/, 'must read invoiceNumber from body');
    assert.match(src, /body\.invoiceDate/, 'must read invoiceDate from body');
    assert.match(src, /autoGenerateNumber/, 'must check autoGenerateNumber flag');
  });

  it('generates number via RPC when autoGenerate is true', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /generate_platform_invoice_number/, 'must call RPC for auto-generation');
  });

  it('validates manual number is non-empty when autoGenerate is false', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /Numer faktury jest wymagany/, 'must require manual number');
  });

  it('validates manual number uniqueness on issue (excluding self)', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /neq.*id.*params\.id/, 'must exclude self from uniqueness check');
    assert.match(src, /409/, 'must return 409 for duplicate');
  });

  it('sets invoice_date in the update', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /invoice_date:/, 'must set invoice_date in update');
  });

  it('includes invoiceDate in the response', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /invoiceDate.*invoiceDateValue/, 'must return invoiceDate in response');
  });

  it('includes invoiceDate in audit payload', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /invoiceDate.*invoiceDateValue/, 'must include invoiceDate in audit');
  });
});

describe('manual invoice number and date — preview endpoint', () => {
  it('returns invoiceDate in the response', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/preview/route.ts');
    assert.match(src, /invoiceDate/, 'preview must return invoiceDate');
  });
});

describe('manual invoice number and date — modal component', () => {
  it('has autoGenNumber state', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /autoGenNumber/, 'must have autoGenNumber state');
    assert.match(src, /setAutoGenNumber/, 'must have setAutoGenNumber');
  });

  it('has manualInvoiceNumber state', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /manualInvoiceNumber/, 'must have manualInvoiceNumber state');
  });

  it('has invoiceDate state defaulting to today', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /invoiceDate/, 'must have invoiceDate state');
    assert.match(src, /new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/, 'must default to today');
  });

  it('has auto-generate toggle checkbox', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /Automatycznie wygeneruj numer faktury/, 'must have auto-generate toggle label');
  });

  it('has tooltip explaining manual/auto number', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /Możesz wpisać własny numer faktury lub pozwolić systemowi wygenerować go automatycznie/, 'must have tooltip');
  });

  it('validates manual number is non-empty before saving draft', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /!autoGenNumber && !manualInvoiceNumber\.trim\(\)/, 'must validate manual number before save');
  });

  it('sends invoiceNumber, invoiceDate, autoGenerateNumber to draft endpoint', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /invoiceNumber.*autoGenNumber/, 'must send invoiceNumber in draft body');
    assert.match(src, /autoGenerateNumber.*autoGenNumber/, 'must send autoGenerateNumber in draft body');
  });

  it('sends invoiceNumber, invoiceDate, autoGenerateNumber to issue endpoint', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /invoiceNumber.*autoGenNumber.*manualInvoiceNumber/, 'must send invoiceNumber to issue');
    assert.match(src, /autoGenerateNumber.*autoGenNumber/, 'must send autoGenerateNumber to issue');
  });

  it('shows invoice number and date in preview', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /Data wystawienia/, 'preview must show issue date');
    assert.match(src, /Numer: automatyczny|manualInvoiceNumber/, 'preview must show invoice number');
  });

  it('shows duplicate error from 409 response', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /409/, 'must handle 409 status');
    assert.match(src, /Numer faktury już istnieje/, 'must show duplicate error message');
  });

  it('disables manual number input when auto-generate is on', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /autoGenNumber \?/, 'must conditionally render manual input vs auto message');
    assert.match(src, /Numer zostanie wygenerowany automatycznie/, 'must show auto-generate placeholder');
  });

  it('updates warning text based on auto-generate mode', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /autoGenNumber \?.*Numer faktury zostanie wygenerowany automatycznie.*:.*Numer faktury.*manualInvoiceNumber/, 'must update warning based on mode');
  });
});
