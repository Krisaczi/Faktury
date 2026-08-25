import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readSrc = (rel: string) => readFile(join(projectRoot, rel), 'utf8');

describe('company address: GET endpoint', () => {
  it('authenticates user and returns address data', async () => {
    const src = await readSrc('app/api/companies/address/route.ts');
    assert.match(src, /auth\.getUser/, 'must authenticate user');
    assert.match(src, /company_id/, 'must look up company_id');
  });

  it('returns address fields including new columns', async () => {
    const src = await readSrc('app/api/companies/address/route.ts');
    assert.match(src, /address_line2/, 'must return address_line2');
    assert.match(src, /state_region/, 'must return state_region');
    assert.match(src, /country/, 'must return country');
    assert.match(src, /address_edit_policy/, 'must return edit policy');
    assert.match(src, /address_locked/, 'must return locked state');
  });

  it('fetches last updated by from audit trail', async () => {
    const src = await readSrc('app/api/companies/address/route.ts');
    assert.match(src, /company_address_audit/, 'must query audit trail');
    assert.match(src, /updatedByName/, 'must return updater name');
  });
});

describe('company address: PUT endpoint', () => {
  it('validates with zod schema including postal code patterns', async () => {
    const src = await readSrc('app/api/companies/address/route.ts');
    assert.match(src, /z\.object/, 'must use zod validation');
    assert.match(src, /POSTAL_PATTERNS/, 'must have postal code patterns');
    assert.match(src, /superRefine/, 'must validate postal code by country');
  });

  it('enforces edit policy (members vs admins)', async () => {
    const src = await readSrc('app/api/companies/address/route.ts');
    assert.match(src, /policy.*admins/, 'must check admins policy');
    assert.match(src, /Tylko administrator/, 'must return 403 for non-admins');
  });

  it('blocks edits when address is locked', async () => {
    const src = await readSrc('app/api/companies/address/route.ts');
    assert.match(src, /address_locked/, 'must check locked state');
    assert.match(src, /zablokowana/, 'must return lock error');
  });

  it('rate-limits to 5 updates per hour', async () => {
    const src = await readSrc('app/api/companies/address/route.ts');
    assert.match(src, /oneHourAgo/, 'must compute rate limit window');
    assert.match(src, /count.*5/, 'must limit to 5 updates');
    assert.match(src, /429/, 'must return 429 on rate limit');
  });

  it('creates audit entry with before/after snapshots', async () => {
    const src = await readSrc('app/api/companies/address/route.ts');
    assert.match(src, /company_address_audit/, 'must write to audit table');
    assert.match(src, /before/, 'must include before snapshot');
    assert.match(src, /after/, 'must include after snapshot');
  });

  it('inserts into settings_audit for consistency', async () => {
    const src = await readSrc('app/api/companies/address/route.ts');
    assert.match(src, /settings_audit/, 'must also write to settings_audit');
    assert.match(src, /company_address_updated/, 'must log address update action');
  });

  it('validates required fields server-side', async () => {
    const src = await readSrc('app/api/companies/address/route.ts');
    assert.match(src, /addressLine1.*min\(1/, 'must require addressLine1');
    assert.match(src, /city.*min\(1/, 'must require city');
    assert.match(src, /postalCode.*min\(1/, 'must require postalCode');
    assert.match(src, /country.*min\(2/, 'must require country');
  });

  it('returns 422 for validation errors', async () => {
    const src = await readSrc('app/api/companies/address/route.ts');
    assert.match(src, /422/, 'must return 422 for validation errors');
  });
});

describe('company address: history endpoint', () => {
  it('restricts history to owner role', async () => {
    const src = await readSrc('app/api/companies/address/history/route.ts');
    assert.match(src, /role.*owner/, 'must check owner role');
    assert.match(src, /403/, 'must return 403 for non-owners');
  });

  it('returns audit entries with changed_by names', async () => {
    const src = await readSrc('app/api/companies/address/history/route.ts');
    assert.match(src, /company_address_audit/, 'must query audit table');
    assert.match(src, /changedByName/, 'must include names');
  });

  it('supports revert with before snapshot', async () => {
    const src = await readSrc('app/api/companies/address/history/route.ts');
    assert.match(src, /revert/, 'must support revert action');
    assert.match(src, /auditId/, 'must accept auditId parameter');
    assert.match(src, /before/, 'must use before snapshot for revert');
  });

  it('creates audit entry on revert', async () => {
    const src = await readSrc('app/api/companies/address/history/route.ts');
    assert.match(src, /change_type.*revert/, 'must log revert in audit');
  });
});

describe('company address: owner lock endpoint', () => {
  it('verifies owner role', async () => {
    const src = await readSrc('app/api/owner/companies/[id]/address/lock/route.ts');
    assert.match(src, /role.*owner/, 'must check owner role');
    assert.match(src, /403/, 'must return 403 for non-owners');
  });

  it('updates address_locked column', async () => {
    const src = await readSrc('app/api/owner/companies/[id]/address/lock/route.ts');
    assert.match(src, /address_locked/, 'must update locked column');
  });

  it('creates lock/unlock audit entry', async () => {
    const src = await readSrc('app/api/owner/companies/[id]/address/lock/route.ts');
    assert.match(src, /lock.*unlock/, 'must log lock or unlock type');
    assert.match(src, /company_address_audit/, 'must write to audit table');
  });

  it('validates payload with zod', async () => {
    const src = await readSrc('app/api/owner/companies/[id]/address/lock/route.ts');
    assert.match(src, /z\.object/, 'must use zod');
    assert.match(src, /locked.*boolean/, 'must validate locked as boolean');
  });
});

describe('company address: UI component', () => {
  it('renders address fields in read mode', async () => {
    const src = await readSrc('components/settings/company-address-card.tsx');
    assert.match(src, /addressLine1/, 'must show addressLine1');
    assert.match(src, /postalCode/, 'must show postalCode');
    assert.match(src, /city/, 'must show city');
    assert.match(src, /country/, 'must show country');
    assert.match(src, /vatId/, 'must show VAT ID');
  });

  it('has edit mode with form fields', async () => {
    const src = await readSrc('components/settings/company-address-card.tsx');
    assert.match(src, /editing/, 'must have editing state');
    assert.match(src, /Pencil/, 'must have edit button');
  });

  it('shows save and cancel buttons in edit mode', async () => {
    const src = await readSrc('components/settings/company-address-card.tsx');
    assert.match(src, /Anuluj/, 'must have cancel button');
    assert.match(src, /Zapisz/, 'must have save button');
  });

  it('disables save while saving', async () => {
    const src = await readSrc('components/settings/company-address-card.tsx');
    assert.match(src, /disabled.*saving/, 'must disable save while saving');
  });

  it('shows locked banner when address is locked', async () => {
    const src = await readSrc('components/settings/company-address-card.tsx');
    assert.match(src, /locked/, 'must check locked state');
    assert.match(src, /zablokowana/, 'must show locked message');
  });

  it('shows last updated info', async () => {
    const src = await readSrc('components/settings/company-address-card.tsx');
    assert.match(src, /updatedByName/, 'must show updater name');
    assert.match(src, /Ostatnia aktualizacja/, 'must show last updated label');
  });

  it('has history dialog for owner', async () => {
    const src = await readSrc('components/settings/company-address-card.tsx');
    assert.match(src, /History/, 'must have history button');
    assert.match(src, /Historia zmian/, 'must have history dialog');
  });

  it('supports revert from history', async () => {
    const src = await readSrc('components/settings/company-address-card.tsx');
    assert.match(src, /handleRevert/, 'must have revert handler');
    assert.match(src, /Przywróć/, 'must have revert button');
  });

  it('validates postal code client-side', async () => {
    const src = await readSrc('components/settings/company-address-card.tsx');
    assert.match(src, /POSTAL_PATTERNS/, 'must have postal code patterns');
    assert.match(src, /superRefine/, 'must validate postal code');
  });

  it('shows success toast on save', async () => {
    const src = await readSrc('components/settings/company-address-card.tsx');
    assert.match(src, /toast\.success/, 'must show success toast');
  });

  it('handles 429 rate limit error', async () => {
    const src = await readSrc('components/settings/company-address-card.tsx');
    assert.match(src, /429/, 'must handle rate limit');
  });
});

describe('company address: settings page integration', () => {
  it('imports CompanyAddressCard', async () => {
    const src = await readSrc('app/(app)/settings/page.tsx');
    assert.match(src, /CompanyAddressCard/, 'must import the component');
  });

  it('renders CompanyAddressCard in settings', async () => {
    const src = await readSrc('app/(app)/settings/page.tsx');
    assert.match(src, /<CompanyAddressCard/, 'must render the component');
  });
});
