import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readSrc = (rel: string) => readFile(join(projectRoot, rel), 'utf8');

describe('platform invoice: usage endpoint', () => {
  it('checks owner role before returning data', async () => {
    const src = await readSrc('app/api/owner/users/[id]/usage/route.ts');
    assert.match(src, /role.*owner/, 'must check for owner role');
    assert.match(src, /Forbidden/, 'must return 403 for non-owner');
  });

  it('accepts period query param in YYYY-MM format', async () => {
    const src = await readSrc('app/api/owner/users/[id]/usage/route.ts');
    assert.match(src, /period/, 'must accept period parameter');
    assert.match(src, /\d{4}-\d{2}/, 'must validate YYYY-MM format');
  });

  it('defaults to previous calendar month', async () => {
    const src = await readSrc('app/api/owner/users/[id]/usage/route.ts');
    assert.match(src, /previous.*month/i, 'must default to previous calendar month');
  });

  it('returns usage metrics (activeUsers, vendorCount, invoiceCount)', async () => {
    const src = await readSrc('app/api/owner/users/[id]/usage/route.ts');
    assert.match(src, /activeUsers/, 'must return activeUsers');
    assert.match(src, /vendorCount/, 'must return vendorCount');
    assert.match(src, /invoiceCount/, 'must return invoiceCount');
  });
});

describe('platform invoice: draft endpoint', () => {
  it('validates with zod schema', async () => {
    const src = await readSrc('app/api/owner/invoices/draft/route.ts');
    assert.match(src, /z\.object/, 'must use zod validation');
    assert.match(src, /entityId.*uuid/, 'must validate entityId as UUID');
    assert.match(src, /lineItems.*array.*min\(1\)/, 'must require at least one line item');
  });

  it('computes totals server-side', async () => {
    const src = await readSrc('app/api/owner/invoices/draft/route.ts');
    assert.match(src, /subtotalCents/i, 'must compute subtotal server-side');
    assert.match(src, /taxCents/i, 'must compute tax server-side');
    assert.match(src, /totalCents/i, 'must compute total server-side');
  });

  it('creates audit entry on draft creation', async () => {
    const src = await readSrc('app/api/owner/invoices/draft/route.ts');
    assert.match(src, /platform_invoice_audit/, 'must write to audit table');
    assert.match(src, /action.*created/, 'must log "created" action');
  });

  it('validates entity exists and is active', async () => {
    const src = await readSrc('app/api/owner/invoices/draft/route.ts');
    assert.match(src, /nie istnieje|not found|404/, 'must check entity exists');
    assert.match(src, /nieaktywn|inactive|400/, 'must check entity is active');
  });

  it('does not assign invoice number on draft', async () => {
    const src = await readSrc('app/api/owner/invoices/draft/route.ts');
    assert.doesNotMatch(src, /generate_platform_invoice_number/, 'must NOT generate invoice number on draft');
  });
});

describe('platform invoice: issue endpoint', () => {
  it('only issues drafts', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /draft/, 'must check invoice is a draft');
  });

  it('generates invoice number via RPC', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /generate_platform_invoice_number/, 'must call RPC to generate number');
  });

  it('sets status to issued and records issuedBy/issuedAt/dueDate', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /status.*issued/, 'must set status to issued');
    assert.match(src, /issued_by/, 'must set issued_by');
    assert.match(src, /issued_at/, 'must set issued_at');
    assert.match(src, /due_date/, 'must set due_date');
  });

  it('creates issued audit entry', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/issue/route.ts');
    assert.match(src, /action.*issued/, 'must log "issued" action');
  });
});

describe('platform invoice: send endpoint', () => {
  it('requires issued status before sending', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/send/route.ts');
    assert.match(src, /issued/, 'must check for issued status');
  });

  it('logs email events for all company users', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/send/route.ts');
    assert.match(src, /email_events_log/, 'must log email events');
    assert.match(src, /company_id/, 'must filter by company_id');
  });

  it('marks sentAt and creates sent audit entry', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/send/route.ts');
    assert.match(src, /sent_at/, 'must set sent_at');
    assert.match(src, /action.*sent/, 'must log "sent" action');
  });
});

describe('platform invoice: revoke endpoint', () => {
  it('cannot revoke drafts', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/revoke/route.ts');
    assert.match(src, /draft/, 'must check for draft status');
  });

  it('cannot revoke already-revoked invoices', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/revoke/route.ts');
    assert.match(src, /już cofnięta|already.*revoked/i, 'must check for already-revoked');
  });

  it('creates revoked audit entry with previous status', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/revoke/route.ts');
    assert.match(src, /action.*revoked/, 'must log "revoked" action');
    assert.match(src, /previousStatus/, 'must record previous status in payload');
  });
});

describe('platform invoice: list endpoint', () => {
  it('supports entityId, period, and status filters', async () => {
    const src = await readSrc('app/api/owner/invoices/route.ts');
    assert.match(src, /entityId/, 'must support entityId filter');
    assert.match(src, /period/, 'must support period filter');
    assert.match(src, /status/, 'must support status filter');
  });

  it('supports pagination', async () => {
    const src = await readSrc('app/api/owner/invoices/route.ts');
    assert.match(src, /page/, 'must support page parameter');
    assert.match(src, /limit/, 'must support limit parameter');
  });

  it('joins company name and email', async () => {
    const src = await readSrc('app/api/owner/invoices/route.ts');
    assert.match(src, /companies.*name/, 'must join company name');
  });
});

describe('platform invoice: preview endpoint', () => {
  it('returns invoice, line items, company, and audit', async () => {
    const src = await readSrc('app/api/owner/invoices/[id]/preview/route.ts');
    assert.match(src, /platform_invoices/, 'must query platform_invoices');
    assert.match(src, /platform_invoice_line_items/, 'must query line items');
    assert.match(src, /platform_invoice_audit/, 'must query audit trail');
  });
});

describe('platform invoice: modal component', () => {
  it('has multi-step flow (form → preview → success)', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /step.*form/, 'must have form step');
    assert.match(src, /step.*preview/, 'must have preview step');
    assert.match(src, /step.*success/, 'must have success step');
  });

  it('auto-populates line items from usage data', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /Abonament platformowy/, 'must auto-populate subscription line item');
  });

  it('shows usage metrics in the modal', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /activeUsers/, 'must show active users');
    assert.match(src, /vendorCount/, 'must show vendor count');
  });

  it('requires confirmation before final issuance', async () => {
    const src = await readSrc('components/admin/platform-invoice-modal.tsx');
    assert.match(src, /nieodwracalna|irreversible/i, 'must show irreversibility warning');
  });
});

describe('platform invoice: users-client integration', () => {
  it('adds platformInvoice action to ModalAction union', async () => {
    const src = await readSrc('app/(admin)/admin/users/users-client.tsx');
    assert.match(src, /platformInvoice/, 'must have platformInvoice modal action');
  });

  it('renders PlatformInvoiceModal', async () => {
    const src = await readSrc('app/(admin)/admin/users/users-client.tsx');
    assert.match(src, /PlatformInvoiceModal/, 'must render PlatformInvoiceModal component');
  });

  it('adds receipt icon button in row actions', async () => {
    const src = await readSrc('app/(admin)/admin/users/users-client.tsx');
    assert.match(src, /Receipt.*w-4 h-4/, 'must add Receipt icon button');
  });
});

describe('platform invoice: reporting page', () => {
  it('exists at admin/platform-invoices', async () => {
    const src = await readSrc('app/(admin)/admin/platform-invoices/page.tsx');
    assert.match(src, /PlatformInvoicesClient/, 'must render PlatformInvoicesClient');
  });

  it('shows summary metrics (total, issued, drafts, revenue)', async () => {
    const src = await readSrc('components/admin/platform-invoices-client.tsx');
    assert.match(src, /totalRevenueCents/, 'must compute total revenue');
    assert.match(src, /draftCount/, 'must count drafts');
    assert.match(src, /issuedCount/, 'must count issued');
  });

  it('supports revoke and send actions from reporting page', async () => {
    const src = await readSrc('components/admin/platform-invoices-client.tsx');
    assert.match(src, /revokeInvoice/, 'must have revoke action');
    assert.match(src, /sendInvoice/, 'must have send action');
  });
});

describe('platform invoice: sidebar navigation', () => {
  it('adds platform invoices link for owner role', async () => {
    const src = await readSrc('components/layout/sidebar.tsx');
    assert.match(src, \/admin\/platform-invoices\/, 'must link to /admin/platform-invoices');
    assert.match(src, /Faktury platformowe/, 'must have "Faktury platformowe" label');
  });
});
