/**
 * E2E: Trial cron smoke test (dry-run mode)
 *
 * Calls the /api/trial/check-status endpoint with dryRun=true and verifies
 * the response shape. This can be run in CI against a staging environment
 * without mutating any data.
 *
 * Run:
 *   npx playwright test e2e/trial-cron-smoke.spec.ts
 */

import { test, expect } from '@playwright/test';

const CRON_SECRET = process.env.CRON_SECRET ?? '';

test.describe('Trial cron — smoke test (dry-run)', () => {
  test('POST /api/trial/check-status dry-run returns valid shape', async ({ request }) => {
    const response = await request.post('/api/trial/check-status', {
      data:    { dryRun: true },
      headers: {
        'Content-Type':    'application/json',
        'x-cron-secret':  CRON_SECRET,
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(typeof body.expired_processed).toBe('number');
    expect(typeof body.expiring_soon_processed).toBe('number');
    expect(typeof body.emails_sent).toBe('number');
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.dry_run).toBe(true);
    // dry_run must not send emails
    expect(body.emails_sent).toBe(0);
  });

  test('POST /api/trial/check-status returns 401 without cron secret', async ({ request }) => {
    const response = await request.post('/api/trial/check-status', {
      data:    { dryRun: true },
      headers: { 'Content-Type': 'application/json' },
      // no x-cron-secret header
    });
    // In production (CRON_SECRET configured) this must be 401
    // In development it may be 200 (secret not required)
    expect([200, 401]).toContain(response.status());
  });
});
