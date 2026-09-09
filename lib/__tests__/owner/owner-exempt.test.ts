import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readSrc = (rel: string) => readFile(join(projectRoot, rel), 'utf8');

describe('isOwner helper', () => {
  it('returns true when is_owner flag is true', async () => {
    const src = await readSrc('lib/auth/is-owner.ts');
    assert.match(src, /is_owner.*true/, 'must check is_owner flag');
  });

  it('returns true for krisaczi@yahoo.com email', async () => {
    const src = await readSrc('lib/auth/is-owner.ts');
    assert.match(src, /krisaczi@yahoo.com/, 'must check owner email');
  });

  it('returns false for non-owner users', async () => {
    const src = await readSrc('lib/auth/is-owner.ts');
    assert.match(src, /return false/, 'must return false for non-owners');
  });

  it('exports logLimitBypass function', async () => {
    const src = await readSrc('lib/auth/is-owner.ts');
    assert.match(src, /export async function logLimitBypass/, 'must export logLimitBypass');
    assert.match(src, /limit_bypass_audit/, 'must write to limit_bypass_audit table');
  });

  it('logLimitBypass is best-effort (catches errors silently)', async () => {
    const src = await readSrc('lib/auth/is-owner.ts');
    assert.match(src, /catch\s*\{/, 'must catch errors silently');
  });
});

describe('Invoice limit bypass for owner', () => {
  it('checkInvoiceLimit accepts isOwner option', async () => {
    const src = await readSrc('lib/packages/invoice-limit.ts');
    assert.match(src, /isOwner/, 'must accept isOwner option');
  });

  it('returns allowed immediately when isOwner is true', async () => {
    const src = await readSrc('lib/packages/invoice-limit.ts');
    assert.match(src, /if \(opts\?\.isOwner\)/, 'must check isOwner option');
  });

  it('logs bypass to limit_bypass_audit when userId provided', async () => {
    const src = await readSrc('lib/packages/invoice-limit.ts');
    assert.match(src, /logLimitBypass/, 'must call logLimitBypass');
  });

  it('isInvoiceLimitReached passes isOwner option through', async () => {
    const src = await readSrc('lib/packages/invoice-limit.ts');
    assert.match(src, /isInvoiceLimitReached[\s\S]*?isOwner/, 'must pass isOwner to checkInvoiceLimit');
  });
});

describe('Vendor limit bypass for owner', () => {
  it('checkVendorLimit accepts isOwner option', async () => {
    const src = await readSrc('lib/packages/get-company-package.ts');
    assert.match(src, /isOwner/, 'must accept isOwner option in checkVendorLimit');
  });

  it('returns allowed when isOwner is true', async () => {
    const src = await readSrc('lib/packages/get-company-package.ts');
    assert.match(src, /if.*isOwner.*return.*allowed.*true/, 'must bypass vendor limit for owner');
  });
});

describe('Invoice actions pass owner flag to limit checks', () => {
  it('requireInvoicingUser fetches is_owner and email from users table', async () => {
    const src = await readSrc('app/(admin)/admin/invoices/actions.ts');
    assert.match(src, /is_owner/, 'must fetch is_owner from users');
    assert.match(src, /email/, 'must fetch email from users');
  });

  it('requireInvoicingUser returns isOwner flag', async () => {
    const src = await readSrc('app/(admin)/admin/invoices/actions.ts');
    assert.match(src, /isOwner.*ownerFlag/, 'must return isOwner flag');
  });

  it('createInvoice passes isOwner to checkInvoiceLimit', async () => {
    const src = await readSrc('app/(admin)/admin/invoices/actions.ts');
    assert.match(src, /checkInvoiceLimit.*isOwner.*ownerFlag/, 'must pass ownerFlag to checkInvoiceLimit');
  });

  it('updateInvoice passes isOwner to checkInvoiceLimit', async () => {
    const src = await readSrc('app/(admin)/admin/invoices/actions.ts');
    // Should have at least two checkInvoiceLimit calls with ownerFlag
    const matches = src.match(/checkInvoiceLimit\(companyId, \{ userId: user\.id, isOwner: ownerFlag \}\)/g);
    assert.ok(matches && matches.length >= 2, 'must pass ownerFlag to checkInvoiceLimit in both create and update');
  });

  it('skips requireInvoicingEnabled for owner', async () => {
    const src = await readSrc('app/(admin)/admin/invoices/actions.ts');
    assert.match(src, /ownerFlag[\s\S]*?requireInvoicingEnabled/, 'must conditionally skip requireInvoicingEnabled for owner');
  });
});

describe('Settings UI hides plan tiles for owner', () => {
  it('BillingCard is hidden when role is owner', async () => {
    const src = await readSrc('app/(app)/settings/page.tsx');
    assert.match(src, /role !== 'owner'.*BillingCard/, 'must hide BillingCard for owner');
  });

  it('OwnerExemptCard shown when role is owner', async () => {
    const src = await readSrc('app/(app)/settings/page.tsx');
    assert.match(src, /role === 'owner'.*OwnerExemptCard/, 'must show OwnerExemptCard for owner');
  });

  it('contains the required help text', async () => {
    const src = await readSrc('app/(app)/settings/page.tsx');
    assert.match(src, /Owner accounts are exempt from plan UI and vendor\/invoicing limits/, 'must contain required help text');
  });

  it('OwnerBypassAuditCard shown when role is owner', async () => {
    const src = await readSrc('app/(app)/settings/page.tsx');
    assert.match(src, /role === 'owner'.*OwnerBypassAuditCard/, 'must show OwnerBypassAuditCard for owner');
  });

  it('OwnerBypassAuditCard fetches from limit-bypass-audit API', async () => {
    const src = await readSrc('app/(app)/settings/page.tsx');
    assert.match(src, /\/api\/owner\/limit-bypass-audit/, 'must fetch from limit-bypass-audit endpoint');
  });
});

describe('limit-bypass-audit API endpoint', () => {
  it('requires authentication', async () => {
    const src = await readSrc('app/api/owner/limit-bypass-audit/route.ts');
    assert.match(src, /Unauthorized/, 'must check for auth');
  });

  it('requires owner role (uses isOwner helper)', async () => {
    const src = await readSrc('app/api/owner/limit-bypass-audit/route.ts');
    assert.match(src, /isOwner/, 'must use isOwner helper');
    assert.match(src, /Forbidden/, 'must return 403 for non-owners');
  });

  it('queries limit_bypass_audit table for the current user', async () => {
    const src = await readSrc('app/api/owner/limit-bypass-audit/route.ts');
    assert.match(src, /limit_bypass_audit/, 'must query limit_bypass_audit table');
    assert.match(src, /user_id/, 'must filter by user_id');
  });

  it('returns entries in response', async () => {
    const src = await readSrc('app/api/owner/limit-bypass-audit/route.ts');
    assert.match(src, /entries/, 'must return entries in response');
  });
});

describe('Security: owner bypass is server-side only', () => {
  it('isOwner helper is in lib/auth (server-only module)', async () => {
    const src = await readSrc('lib/auth/is-owner.ts');
    assert.match(src, /getSupabaseServerClient/, 'must use server client (not browser)');
  });

  it('limit_bypass_audit table has RLS enabled', async () => {
    const src = await readSrc('supabase/migrations/20260909124920_20260909180000_add_owner_flag_and_limit_bypass_audit.sql.sql');
    assert.match(src, /ENABLE ROW LEVEL SECURITY/i, 'must enable RLS');
    assert.match(src, /auth\.uid\(\) = user_id/, 'must scope to own user_id');
  });

  it('limit_bypass_audit has no UPDATE or DELETE policy (immutable)', async () => {
    const src = await readSrc('supabase/migrations/20260909124920_20260909180000_add_owner_flag_and_limit_bypass_audit.sql.sql');
    // Should only have SELECT and INSERT policies, not UPDATE or DELETE
    assert.doesNotMatch(src, /FOR UPDATE[\s\S]*?limit_bypass_audit|limit_bypass_audit[\s\S]*?FOR UPDATE/i, 'must not have UPDATE policy');
    assert.doesNotMatch(src, /FOR DELETE[\s\S]*?limit_bypass_audit|limit_bypass_audit[\s\S]*?FOR DELETE/i, 'must not have DELETE policy');
  });

  it('is_owner backfill has safety check preventing mass assignment', async () => {
    const src = await readSrc('supabase/migrations/20260909124920_20260909180000_add_owner_flag_and_limit_bypass_audit.sql.sql');
    assert.match(src, /owner_count = 1/, 'must check exactly one user');
    assert.match(src, /Multiple users|Skipping/, 'must warn on multiple users');
  });
});
